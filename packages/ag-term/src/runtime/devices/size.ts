/**
 * term.size — single source of truth for terminal dimensions, exposed as
 * reactive ReadSignals.
 *
 * Wraps the WriteStream's columns/rows behind an alien-signals signal so every
 * reader sees the same value and can participate in the reactive graph
 * (computed / effect). The signals are read-only from the outside — writes
 * happen internally on `resize` events (after coalescing).
 *
 * Resize coalescing: multiplexers (tmux, cmux, Ghostty tabs) can fire
 * multiple SIGWINCH bursts in rapid succession as the PTY re-syncs. Without
 * coalescing, each event triggers a full re-layout at an intermediate size,
 * producing visible multi-phase layout shift. The owner coalesces bursts
 * within one 60Hz frame (~16ms) into a single update carrying the final
 * geometry. Discrete resizes spaced further apart pass through normally.
 *
 * ## API shape
 *
 * ```ts
 * size.cols()          // current width
 * size.rows()          // current height
 * size.snapshot()      // { cols, rows }
 * effect(() => { … use size.cols() … })  // subscribe reactively
 * size.subscribe(fn)   // imperative push callback (useSyncExternalStore / event-queue)
 * ```
 *
 * Both `effect(() => size.cols())` and `size.subscribe(fn)` get the same
 * coalesced updates. The imperative `subscribe` is retained for callers
 * that already have a push-callback shape (React's useSyncExternalStore and
 * the term-provider event queue).
 *
 * Ownership: one `Size` per terminal session. Constructed by `createTerm()`
 * (Node terminal) or the emulator path (termless). Readers never touch
 * `stdout.columns` / `stdout.rows` directly.
 *
 * Bead: km-silvery.term-sub-owners (Phase 5) + km-silvery.modes-as-signals
 * follow-up (expose as ReadSignal).
 */

import { signal, computed, type ReadSignal } from "@silvery/signals"

/** Snapshot of terminal dimensions. */
export interface SizeSnapshot {
  readonly cols: number
  readonly rows: number
}

/**
 * Terminal size sub-owner.
 *
 * `cols`, `rows`, and `snapshot` are alien-signals `ReadSignal`s — call them
 * as functions to read the current value and, inside a `computed` / `effect`,
 * to subscribe to changes. `subscribe(handler)` is a companion imperative
 * push API retained for React's `useSyncExternalStore` and the term-provider
 * event queue.
 */
export interface Size extends Disposable {
  /** Current terminal width in columns. */
  readonly cols: ReadSignal<number>

  /** Current terminal height in rows. */
  readonly rows: ReadSignal<number>

  /** Current dimensions as a plain snapshot. */
  readonly snapshot: ReadSignal<SizeSnapshot>

  /**
   * Subscribe to resize events via a push callback. Handler fires after the
   * 16ms coalescing window elapses with the final geometry. Returns an
   * unsubscribe function. Complementary to `effect(() => size.cols())` —
   * same updates, different caller shape.
   */
  subscribe(handler: (s: SizeSnapshot) => void): () => void
}

/** One 60Hz frame — long enough to absorb PTY re-sync bursts, short enough to feel immediate. */
const RESIZE_COALESCE_MS = 16

/**
 * Options for `createSize`.
 */
export interface CreateSizeOptions {
  /** Override initial cols (default: `stdout.columns || 80`). */
  cols?: number
  /** Override initial rows (default: `stdout.rows || 24`). */
  rows?: number
  /**
   * Coalescing window in ms. Defaults to 16 (one 60Hz frame).
   * Set to 0 to disable coalescing (test scenarios).
   */
  coalesceMs?: number
}

/**
 * Create a `Size` owner from a WriteStream. Subscribes to the stream's
 * `resize` event, coalesces bursts, and publishes the final geometry to
 * subscribers via alien-signals.
 *
 * Idempotent dispose: removes the resize listener and clears any pending
 * coalesce timer. Subsequent reads still work — the last known cols/rows
 * remain in the signal.
 */
export function createSize(
  stdout: NodeJS.WriteStream,
  options: CreateSizeOptions = {},
): Size {
  const coalesceMs = options.coalesceMs ?? RESIZE_COALESCE_MS
  const initialCols = options.cols ?? stdout.columns ?? 80
  const initialRows = options.rows ?? stdout.rows ?? 24

  // Writable signal owned privately — readers see it only through the
  // ReadSignal exports below. Fine-grained subscribers use `effect(() =>
  // size.cols())` (or similar); the legacy `subscribe` callback list is
  // kept in parallel for push-shaped consumers.
  const _snapshot = signal<SizeSnapshot>({ cols: initialCols, rows: initialRows })

  // Subscriber set — notified on each coalesced resize.
  const listeners = new Set<(s: SizeSnapshot) => void>()

  let disposed = false
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null
  let installed = false

  const flush = () => {
    coalesceTimer = null
    if (disposed) return
    const next: SizeSnapshot = {
      cols: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    }
    _snapshot(next)
    listeners.forEach((l) => l(next))
  }

  const onResize = () => {
    if (disposed) return
    if (coalesceMs === 0) {
      flush()
      return
    }
    if (coalesceTimer !== null) return
    coalesceTimer = setTimeout(flush, coalesceMs)
  }

  // Lazy install — the resize listener is only attached on first subscribe().
  // Consumers that never subscribe (e.g. style-only createTerm() usages from
  // chalk-compat call sites in km-tui/text/*) pay zero listeners. Prevents
  // the MaxListenersExceededWarning that surfaced when every createTerm()
  // eagerly wired one. Matches the laziness of input/output/console owners.
  //
  // Reads still go through `_snapshot()` so the options.cols/rows override
  // and the last known coalesced value remain authoritative.
  const ensureInstalled = () => {
    if (installed || disposed) return
    installed = true
    stdout.on("resize", onResize)
  }

  const cols = computed(() => _snapshot().cols)
  const rows = computed(() => _snapshot().rows)
  // snapshot is already the underlying signal shape — a plain () => T is
  // enough; wrapping it in a computed adds an extra node for no benefit.
  const snapshotRead: ReadSignal<SizeSnapshot> = () => _snapshot()

  return {
    cols,
    rows,
    snapshot: snapshotRead,
    subscribe(handler: (s: SizeSnapshot) => void): () => void {
      ensureInstalled()
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      if (installed) {
        stdout.off("resize", onResize)
        installed = false
      }
      if (coalesceTimer !== null) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }
      listeners.clear()
    },
  }
}

/**
 * Create a fixed-dimensions `Size` for headless / emulator terminals.
 *
 * No stream is observed. `update(cols, rows)` is the only way dimensions
 * change; the emulator-backed term calls it on explicit resize.
 */
export function createFixedSize(initial: SizeSnapshot): Size & {
  update(cols: number, rows: number): void
} {
  const _snapshot = signal<SizeSnapshot>(initial)
  const listeners = new Set<(s: SizeSnapshot) => void>()
  let disposed = false

  const cols = computed(() => _snapshot().cols)
  const rows = computed(() => _snapshot().rows)
  const snapshotRead: ReadSignal<SizeSnapshot> = () => _snapshot()

  return {
    cols,
    rows,
    snapshot: snapshotRead,
    subscribe(handler: (s: SizeSnapshot) => void): () => void {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    update(cols: number, rows: number) {
      if (disposed) return
      const next: SizeSnapshot = { cols, rows }
      _snapshot(next)
      listeners.forEach((l) => l(next))
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      listeners.clear()
    },
  }
}
