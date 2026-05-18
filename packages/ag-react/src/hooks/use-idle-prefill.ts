/**
 * IdlePrefillScheduler — Wave-3 / W6 primitive.
 *
 * Yield-friendly walker that drives a `MeasurementCache` watermark forward by
 * measuring rows in small chunks during idle slices. Each chunk runs inside a
 * `setTimeout(0)` callback so the host JS thread stays responsive: between
 * chunks the runtime is free to process keystrokes, paint frames, deliver
 * tribe events, etc.
 *
 * Why a hand-rolled scheduler rather than `requestIdleCallback` — the terminal
 * runtime has no rAF / rIC; `setTimeout(0)` is the closest portable yield
 * primitive available across bun / node / pty hosts. Each chunk is bounded
 * to `chunkSize` row measurements (default 16 ≈ ~5ms wall on the median
 * row) so individual yields stay well below the perceptual blocking
 * threshold.
 *
 * Pattern: requestIdleCallback-style "walk-the-watermark" job, modelled on
 * Monaco's `LineHeightsManager` background-fill loop (the rIC half of the
 * prefix-sum machinery in `src/vs/editor/common/viewLayout/linesLayout.ts`).
 *
 * Standalone primitive — does not depend on the concrete `MeasurementCache`
 * type (W5 lands separately). Consumers wire it together via the
 * `WatermarkSource` and `measureRow` callbacks. The follow-up wave (W7) will
 * spin up the canonical wiring inside ListView.
 *
 * See `hub/silvercode/design/scroll-wave3-plan.md` § W6 and
 * `@km/silvery/15338-W6-idle-prefill-scheduler`.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Read-only view onto the cache the scheduler is walking. The scheduler
 * polls `watermark` to decide whether to keep going, and reads `rowCount`
 * to know when the walk is complete.
 *
 * `MeasurementCache` (W5) will satisfy this shape directly; tests can supply
 * a hand-rolled mock with the same fields.
 */
export interface WatermarkSource {
  /** Highest contiguous row index for which an accurate offset is known. */
  readonly watermark: number
  /** Total row count the scheduler should fill up to. */
  readonly rowCount: number
}

/**
 * Subscribe to "user is actively interacting" notifications. The scheduler
 * pauses immediately when the callback fires; consumers can later call
 * `start()` again to resume. Returns an unsubscribe function.
 *
 * Injected rather than imported from a global runtime singleton so the
 * primitive stays test-friendly and decoupled from any specific
 * activity-source implementation (key handler, mouse driver, etc.).
 */
export type UserActivitySubscribe = (onActivity: () => void) => () => void

/**
 * Schedule a callback to run on the next idle slice. Defaults to
 * `setTimeout(fn, 0)`; tests inject a fake scheduler to advance time
 * deterministically.
 *
 * Returns a handle that `cancel` can dispose. The handle type is opaque
 * (`unknown`) so both real `Timer`s and fake-test tokens fit.
 */
export interface IdleScheduler {
  schedule(fn: () => void): unknown
  cancel(handle: unknown): void
}

/** Default scheduler — production callers usually want this. */
export const defaultIdleScheduler: IdleScheduler = {
  schedule(fn) {
    return setTimeout(fn, 0)
  },
  cancel(handle) {
    if (handle !== undefined && handle !== null) {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    }
  },
}

export interface IdlePrefillOptions {
  /** Cache whose watermark we're advancing. */
  source: WatermarkSource
  /**
   * Measure row at `index`. The callback is responsible for calling
   * `source.setMeasurement(index, h)` (or equivalent) — the scheduler does
   * not own the cache write path, it just paces the calls.
   *
   * Implementations are free to be async-internally (queue a layout op
   * etc.) but the scheduler treats each call as a unit of work and yields
   * after `chunkSize` of them.
   */
  measureRow: (index: number) => void
  /** Optional user-activity hook; scheduler pauses on activity if provided. */
  subscribeUserActivity?: UserActivitySubscribe
  /** Default 16 rows per idle slice. Lower = less startup blocking. */
  chunkSize?: number
  /** Defaults to `defaultIdleScheduler`. Tests inject a fake. */
  scheduler?: IdleScheduler
}

export interface IdlePrefill {
  /** Begin (or resume) the walk. No-op if already running or already complete. */
  start(): void
  /** Pause the walk; resumes from the same row on the next `start()`. */
  pause(): void
  /** Stop the walk and release the activity subscription. Idempotent. */
  dispose(): void
  /** Current chunk size; mutable, takes effect on the next idle slice. */
  chunkSize: number
  /** True while a future idle slice is scheduled. */
  readonly running: boolean
  /** True once `watermark === rowCount - 1`. */
  readonly complete: boolean
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a fresh IdlePrefillScheduler. The scheduler is inert until
 * `start()` is called.
 *
 * Invariants:
 * - Starting an already-running scheduler is a no-op (does not double-book
 *   timer slots).
 * - Starting a complete scheduler is a no-op.
 * - `pause()` cancels the pending slice synchronously — the next chunk does
 *   NOT run after pause returns.
 * - User-activity notifications call `pause()` (resumable via `start()`).
 * - `dispose()` unsubscribes from user activity AND pauses; the scheduler
 *   cannot be reused after dispose.
 * - The walk advances by measuring `source.watermark + 1` each step. If the
 *   watermark fails to advance (e.g. an out-of-order measurement landed),
 *   the next step still asks for `watermark + 1`. This is intentional: the
 *   scheduler trusts the cache to converge.
 */
export function createIdlePrefill(opts: IdlePrefillOptions): IdlePrefill {
  const scheduler = opts.scheduler ?? defaultIdleScheduler
  let chunkSize = opts.chunkSize ?? 16
  if (chunkSize < 1) chunkSize = 1

  let pendingHandle: unknown = undefined
  let disposed = false
  let unsubscribeActivity: (() => void) | undefined

  function isComplete(): boolean {
    const { watermark, rowCount } = opts.source
    return rowCount === 0 || watermark >= rowCount - 1
  }

  function runChunk(): void {
    pendingHandle = undefined
    if (disposed) return
    if (isComplete()) return

    const startWatermark = opts.source.watermark
    let nextIndex = startWatermark + 1
    for (let i = 0; i < chunkSize; i++) {
      if (nextIndex >= opts.source.rowCount) break
      opts.measureRow(nextIndex)
      // Re-read watermark — measurement may have advanced it (the common
      // case) or left it where it was (out-of-order arrival). Either way
      // the next call targets the lowest unfilled index.
      const newWatermark = opts.source.watermark
      nextIndex = Math.max(newWatermark + 1, nextIndex + 1)
    }

    if (!isComplete() && !disposed) {
      pendingHandle = scheduler.schedule(runChunk)
    }
  }

  function start(): void {
    if (disposed) return
    if (pendingHandle !== undefined) return
    if (isComplete()) return
    pendingHandle = scheduler.schedule(runChunk)
  }

  function pause(): void {
    if (pendingHandle !== undefined) {
      scheduler.cancel(pendingHandle)
      pendingHandle = undefined
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    pause()
    if (unsubscribeActivity !== undefined) {
      try {
        unsubscribeActivity()
      } catch {
        /* swallow — caller's subscription cleanup must not crash dispose */
      }
      unsubscribeActivity = undefined
    }
  }

  if (opts.subscribeUserActivity !== undefined) {
    unsubscribeActivity = opts.subscribeUserActivity(() => {
      // User activity → bail out of any in-flight slice. Consumer decides
      // when to resume by calling start() again.
      pause()
    })
  }

  return {
    start,
    pause,
    dispose,
    get chunkSize(): number {
      return chunkSize
    },
    set chunkSize(value: number) {
      chunkSize = value < 1 ? 1 : value
    },
    get running(): boolean {
      return pendingHandle !== undefined
    },
    get complete(): boolean {
      return isComplete()
    },
  }
}
