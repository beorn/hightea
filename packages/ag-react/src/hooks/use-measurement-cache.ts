/**
 * MeasurementCache — prefix-sum row-height cache with valid-index watermark.
 *
 * Pattern: Monaco's `LineHeightsManager._prefixSumValidIndex`
 * (`src/vs/editor/common/viewLayout/linesLayout.ts`). Each row contributes a
 * height; prefix-sums accumulate. The cache holds a `_prefixSumValidIndex`
 * watermark — positions ≤ watermark have O(1) accurate offsets; positions >
 * watermark fall back to estimate (defaultRowHeight × distance).
 *
 * Design intent
 * -------------
 * - **Mount with all rows as estimates.** Watermark = −1, all offsets =
 *   `i * defaultRowHeight`.
 * - **Each row reports its measured height** via `setMeasurement(i, h)`. If
 *   `i === watermark + 1` the watermark advances (and walks forward through
 *   any contiguous out-of-order measurements that have already arrived).
 *   Otherwise the height is stored but the watermark does not move — out-of-
 *   order measurements wait for the watermark to catch up.
 * - **Streaming reflow** (row resizes / reorders): caller invokes
 *   `invalidateFrom(i)` → watermark drops to `i − 1`. Stored heights are
 *   preserved past the new watermark so callers can re-measure or trust them.
 *   Pass `dropStoredHeights: true` to also forget the heights themselves.
 *
 * Bead: @km/silvery/15337-W5-measurement-cache-prefix-sum-watermark
 * Design doc: hub/silvercode/design/scroll-wave3-plan.md § W5
 * Prior art: vs/editor/common/viewLayout/linesLayout.ts
 *
 * Pure-data primitive: no React, no signals, no scheduler. Integration with
 * ListView lands in W7 (do not edit ListView from this file).
 */

// =============================================================================
// Public types
// =============================================================================

/**
 * Prefix-sum row-height cache with a valid-index watermark.
 *
 * All offsets and heights are in row units (terminal rows = cells of vertical
 * space). The cache is agnostic to the coordinate system — callers may use
 * pixels too.
 *
 * Invariants:
 * - `watermark === -1` means no contiguous measurements from index 0.
 * - For `0 <= i <= watermark`, `getOffset(i)` is exact (sum of measured
 *   heights for rows `0..i-1`).
 * - For `i > watermark`, `getOffset(i)` is an estimate
 *   `getOffset(watermark + 1) + (i - watermark - 1) * defaultRowHeight`.
 */
export interface MeasurementCache {
  /** O(1) offset for rows ≤ watermark + 1; estimate for rows beyond. */
  getOffset(index: number): number

  /** O(log n) inverse — find the row index that contains the given offset. */
  getIndexAtOffset(offset: number): number

  /**
   * Record measured height for a row.
   *
   * - If `index === watermark + 1`, the watermark advances and walks forward
   *   through any contiguous out-of-order measurements.
   * - Otherwise the height is stored and applied later when the watermark
   *   catches up.
   * - Re-setting an index ≤ watermark with a different height **invalidates
   *   the watermark** down to `index − 1` (because subsequent prefix sums are
   *   now stale). Re-setting with the same height is a no-op.
   *
   * @throws if `height` is negative or non-finite.
   */
  setMeasurement(index: number, height: number): void

  /**
   * Mark rows ≥ `index` as needing re-measurement.
   *
   * Drops the watermark to `index − 1`. Stored heights past the new watermark
   * are preserved (so the cache can re-walk forward as fresh measurements
   * arrive). Pass `dropStoredHeights: true` to forget them entirely.
   */
  invalidateFrom(index: number, options?: { dropStoredHeights?: boolean }): void

  /** Highest index `i` such that `getOffset(0..i+1)` is exact. −1 if none. */
  readonly watermark: number

  /**
   * Default row height used for estimates past the watermark.
   *
   * Mutable: callers can refine the estimate as more data arrives. Changing
   * this does NOT invalidate measured rows — only the estimate beyond the
   * watermark.
   */
  defaultRowHeight: number

  /**
   * Whether a height has been recorded for `index` (regardless of whether
   * the watermark has reached it yet). Primarily useful for tests + the
   * idle-prefill scheduler (W6).
   */
  hasMeasurement(index: number): boolean

  /**
   * Read back a stored measurement. Returns `undefined` if none recorded.
   * Primarily useful for tests + introspection.
   */
  getStoredHeight(index: number): number | undefined
}

export interface CreateMeasurementCacheOptions {
  /** Default row height for unmeasured rows. Must be > 0. Default: 1. */
  defaultRowHeight?: number
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a fresh MeasurementCache.
 *
 * Cost model:
 * - `setMeasurement(i, h)` amortized O(1) when measurements arrive in order.
 *   Out-of-order: O(1) to store, O(k) when the watermark eventually catches
 *   up through a run of `k` contiguous stored heights.
 * - `getOffset(i)` O(1) for any `i`.
 * - `getIndexAtOffset(off)` O(log watermark) within the measured prefix;
 *   O(1) past the watermark (pure division).
 * - `invalidateFrom(i)` O(1).
 *
 * Memory: O(maxIndexEverMeasured). Two parallel arrays — `heights` (raw) and
 * `prefixSums` (cumulative through watermark). No sparse-array overhead — we
 * use a `Map` for stored heights so unmeasured indices cost nothing.
 */
export function createMeasurementCache(
  options: CreateMeasurementCacheOptions = {},
): MeasurementCache {
  const initialDefault = options.defaultRowHeight ?? 1
  if (!Number.isFinite(initialDefault) || initialDefault <= 0) {
    throw new RangeError(
      `createMeasurementCache: defaultRowHeight must be a positive finite number, got ${initialDefault}`,
    )
  }

  /** Stored measurements keyed by index. Sparse-safe. */
  const heights = new Map<number, number>()

  /**
   * prefixSums[i] = sum of heights[0..i] for 0 ≤ i ≤ watermark. Truncated to
   * `watermark + 1` entries. Past the watermark, prefix sums are unknown and
   * the array is not extended.
   */
  const prefixSums: number[] = []

  let watermark = -1
  let defaultRowHeight = initialDefault

  /**
   * Walk the watermark forward through any contiguous stored heights starting
   * at `watermark + 1`. Idempotent.
   */
  function walkForward(): void {
    let next = watermark + 1
    while (heights.has(next)) {
      const h = heights.get(next)!
      const prev = next === 0 ? 0 : prefixSums[next - 1]!
      prefixSums[next] = prev + h
      watermark = next
      next++
    }
  }

  /**
   * Drop the watermark to `newWatermark` (must be < current watermark) and
   * truncate the prefix-sum array accordingly.
   */
  function dropWatermark(newWatermark: number): void {
    if (newWatermark >= watermark) return
    watermark = newWatermark
    // prefixSums[i] is only valid for 0 ≤ i ≤ watermark — truncate.
    prefixSums.length = Math.max(0, newWatermark + 1)
  }

  const cache: MeasurementCache = {
    get watermark(): number {
      return watermark
    },
    get defaultRowHeight(): number {
      return defaultRowHeight
    },
    set defaultRowHeight(value: number) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(
          `MeasurementCache.defaultRowHeight must be positive and finite, got ${value}`,
        )
      }
      defaultRowHeight = value
    },

    getOffset(index: number): number {
      if (!Number.isFinite(index) || index < 0) {
        throw new RangeError(
          `MeasurementCache.getOffset: index must be a non-negative finite number, got ${index}`,
        )
      }
      if (index === 0) return 0
      // Exact path: row `index` starts where row `index - 1` ends — i.e.
      // the prefix sum through `index - 1`. That's valid as long as
      // `index - 1 <= watermark`.
      if (index - 1 <= watermark) {
        return prefixSums[index - 1] ?? 0
      }
      // Estimate path: known portion (through watermark) + estimate of
      // rows `watermark + 1 .. index - 1`.
      const knownEnd = watermark >= 0 ? prefixSums[watermark]! : 0
      const estimatedRows = index - 1 - watermark
      return knownEnd + estimatedRows * defaultRowHeight
    },

    getIndexAtOffset(offset: number): number {
      if (!Number.isFinite(offset)) {
        throw new RangeError(
          `MeasurementCache.getIndexAtOffset: offset must be finite, got ${offset}`,
        )
      }
      if (offset <= 0) return 0

      const measuredEnd = watermark >= 0 ? prefixSums[watermark]! : 0

      // Past the measured prefix → constant-time estimate.
      if (offset >= measuredEnd) {
        const overflow = offset - measuredEnd
        const estimatedRowsPast = Math.floor(overflow / defaultRowHeight)
        return watermark + 1 + estimatedRowsPast
      }

      // Within measured prefix → binary search in prefixSums[0..watermark].
      // We want the smallest i in [0, watermark] with prefixSums[i] > offset.
      // That's the row that contains `offset` (its top is prefixSums[i-1],
      // its bottom is prefixSums[i]).
      let lo = 0
      let hi = watermark
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (prefixSums[mid]! <= offset) {
          lo = mid + 1
        } else {
          hi = mid
        }
      }
      return lo
    },

    setMeasurement(index: number, height: number): void {
      if (!Number.isFinite(index) || index < 0 || !Number.isInteger(index)) {
        throw new RangeError(
          `MeasurementCache.setMeasurement: index must be a non-negative integer, got ${index}`,
        )
      }
      if (!Number.isFinite(height) || height < 0) {
        throw new RangeError(
          `MeasurementCache.setMeasurement: height must be a non-negative finite number, got ${height}`,
        )
      }

      const prev = heights.get(index)
      const sameHeight = prev === height
      if (!sameHeight) heights.set(index, height)

      if (index <= watermark) {
        if (sameHeight) return // measured prefix unchanged
        // Re-measuring inside the measured prefix invalidates the run
        // from `index` onward. Drop the watermark; the next walk-forward
        // (triggered now since `heights[index]` is set and `index ===
        // new-watermark + 1`) will re-apply with the new height.
        dropWatermark(index - 1)
        walkForward()
      } else if (index === watermark + 1) {
        // Either we just stored a fresh height, or the stored height
        // was already there from a prior invalidate — either way the
        // watermark can now walk forward.
        walkForward()
      }
      // else: out-of-order, stored only. Watermark stays put.
    },

    invalidateFrom(index: number, options: { dropStoredHeights?: boolean } = {}): void {
      if (!Number.isFinite(index) || index < 0 || !Number.isInteger(index)) {
        throw new RangeError(
          `MeasurementCache.invalidateFrom: index must be a non-negative integer, got ${index}`,
        )
      }
      if (options.dropStoredHeights) {
        // Forget all stored heights at or past `index`.
        for (const key of heights.keys()) {
          if (key >= index) heights.delete(key)
        }
      }
      dropWatermark(index - 1)
    },

    hasMeasurement(index: number): boolean {
      return heights.has(index)
    },

    getStoredHeight(index: number): number | undefined {
      return heights.get(index)
    },
  }

  return cache
}
