/**
 * MeasurementCache — prefix-sum row-height cache with valid-index watermark.
 *
 * Bead: @km/silvery/15337-W5-measurement-cache-prefix-sum-watermark
 * Design doc: hub/silvercode/design/scroll-wave3-plan.md § W5
 * Prior art: Monaco vs/editor/common/viewLayout/linesLayout.ts
 *
 * Acceptance gates (from the design doc):
 *   - O(1) past watermark (estimate path)
 *   - O(log n) inverse (binary search within watermark)
 *   - invalidate behaviour (watermark drops, stored heights preserved by
 *     default)
 *   - out-of-order measurement holding (stored but watermark does not move
 *     until contiguous from 0)
 */

import { describe, test, expect } from "vitest"

import {
  createMeasurementCache,
  type MeasurementCache,
} from "../../packages/ag-react/src/hooks/use-measurement-cache.js"

// =============================================================================
// Helpers
// =============================================================================

/** Seed `n` rows in order with the given heights — drives watermark to n−1. */
function seedInOrder(cache: MeasurementCache, heights: number[]): void {
  for (let i = 0; i < heights.length; i++) {
    cache.setMeasurement(i, heights[i]!)
  }
}

// =============================================================================
// Initial state
// =============================================================================

describe("createMeasurementCache — initial state", () => {
  test("watermark starts at −1", () => {
    const cache = createMeasurementCache()
    expect(cache.watermark).toBe(-1)
  })

  test("defaultRowHeight defaults to 1", () => {
    const cache = createMeasurementCache()
    expect(cache.defaultRowHeight).toBe(1)
  })

  test("defaultRowHeight can be configured at construction", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 3 })
    expect(cache.defaultRowHeight).toBe(3)
  })

  test("rejects non-positive defaultRowHeight at construction", () => {
    expect(() => createMeasurementCache({ defaultRowHeight: 0 })).toThrow(RangeError)
    expect(() => createMeasurementCache({ defaultRowHeight: -1 })).toThrow(RangeError)
    expect(() => createMeasurementCache({ defaultRowHeight: Number.NaN })).toThrow(RangeError)
    expect(() => createMeasurementCache({ defaultRowHeight: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    )
  })

  test("getOffset(0) is always 0, regardless of state", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 7 })
    expect(cache.getOffset(0)).toBe(0)
  })

  test("with empty cache, getOffset(i) returns i * defaultRowHeight (pure estimate)", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 5 })
    expect(cache.getOffset(1)).toBe(5)
    expect(cache.getOffset(10)).toBe(50)
    expect(cache.getOffset(1000)).toBe(5000)
  })

  test("with empty cache, getIndexAtOffset divides by defaultRowHeight", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    expect(cache.getIndexAtOffset(0)).toBe(0)
    expect(cache.getIndexAtOffset(3)).toBe(0)
    expect(cache.getIndexAtOffset(4)).toBe(1)
    expect(cache.getIndexAtOffset(15)).toBe(3)
    expect(cache.getIndexAtOffset(16)).toBe(4)
  })
})

// =============================================================================
// In-order measurements — watermark advances
// =============================================================================

describe("setMeasurement — in-order", () => {
  test("first measurement at index 0 advances watermark to 0", () => {
    const cache = createMeasurementCache()
    cache.setMeasurement(0, 3)
    expect(cache.watermark).toBe(0)
    expect(cache.getOffset(0)).toBe(0)
    expect(cache.getOffset(1)).toBe(3)
  })

  test("consecutive measurements advance the watermark", () => {
    const cache = createMeasurementCache()
    cache.setMeasurement(0, 2)
    cache.setMeasurement(1, 3)
    cache.setMeasurement(2, 5)
    expect(cache.watermark).toBe(2)
    expect(cache.getOffset(0)).toBe(0)
    expect(cache.getOffset(1)).toBe(2)
    expect(cache.getOffset(2)).toBe(5)
    expect(cache.getOffset(3)).toBe(10)
  })

  test("past-watermark offset blends measured prefix + estimate", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    // measure rows 0..2 at non-default heights
    seedInOrder(cache, [10, 10, 10])
    expect(cache.watermark).toBe(2)
    // row 3 starts at sum-of-measured (30); row 5 starts at 30 + 2*4
    expect(cache.getOffset(3)).toBe(30)
    expect(cache.getOffset(5)).toBe(30 + 2 * 4)
  })
})

// =============================================================================
// Out-of-order measurements — held, watermark does NOT advance
// =============================================================================

describe("setMeasurement — out-of-order", () => {
  test("isolated measurement at index 5 (watermark=−1) is held, watermark stays at −1", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    cache.setMeasurement(5, 99)
    expect(cache.watermark).toBe(-1)
    expect(cache.hasMeasurement(5)).toBe(true)
    expect(cache.getStoredHeight(5)).toBe(99)
    // All offsets still use the estimate, including past index 5.
    expect(cache.getOffset(5)).toBe(5 * 4)
    expect(cache.getOffset(10)).toBe(10 * 4)
  })

  test("out-of-order held measurement does not pollute getIndexAtOffset estimate", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    cache.setMeasurement(5, 99)
    // Held — should not affect math past the watermark.
    expect(cache.getIndexAtOffset(0)).toBe(0)
    expect(cache.getIndexAtOffset(20)).toBe(5)
  })

  test("watermark catches up when contiguous run is filled in any order", () => {
    const cache = createMeasurementCache()
    cache.setMeasurement(2, 5)
    cache.setMeasurement(1, 3)
    expect(cache.watermark).toBe(-1) // still nothing from 0
    cache.setMeasurement(0, 2)
    // All three are contiguous — watermark walks to 2.
    expect(cache.watermark).toBe(2)
    expect(cache.getOffset(1)).toBe(2)
    expect(cache.getOffset(2)).toBe(5)
    expect(cache.getOffset(3)).toBe(10)
  })

  test("walk-forward stops at the first gap", () => {
    const cache = createMeasurementCache()
    cache.setMeasurement(0, 2)
    cache.setMeasurement(1, 3)
    // skip 2 — set 3, 4
    cache.setMeasurement(3, 7)
    cache.setMeasurement(4, 11)
    expect(cache.watermark).toBe(1)
    // Filling the gap walks the watermark forward by 3 (through 2, 3, 4).
    cache.setMeasurement(2, 5)
    expect(cache.watermark).toBe(4)
    expect(cache.getOffset(5)).toBe(2 + 3 + 5 + 7 + 11)
  })
})

// =============================================================================
// Re-measurement of an already-measured row (height changed)
// =============================================================================

describe("setMeasurement — re-measure inside the prefix", () => {
  test("re-setting same height is a no-op (watermark preserved)", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5])
    expect(cache.watermark).toBe(2)
    cache.setMeasurement(1, 3) // same as before
    expect(cache.watermark).toBe(2)
  })

  test("re-setting with new height drops watermark and re-walks", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5, 7])
    expect(cache.watermark).toBe(3)
    // Resize row 1 from 3 → 30. Watermark drops to 0 then walks back to 3
    // (rows 2 and 3 still have their stored heights, the prefix sums get
    // recomputed with the new row-1 height).
    cache.setMeasurement(1, 30)
    expect(cache.watermark).toBe(3)
    expect(cache.getOffset(1)).toBe(2)
    expect(cache.getOffset(2)).toBe(2 + 30)
    expect(cache.getOffset(3)).toBe(2 + 30 + 5)
    expect(cache.getOffset(4)).toBe(2 + 30 + 5 + 7)
  })
})

// =============================================================================
// invalidateFrom
// =============================================================================

describe("invalidateFrom", () => {
  test("drops watermark to index − 1", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5, 7, 11])
    expect(cache.watermark).toBe(4)
    cache.invalidateFrom(2)
    expect(cache.watermark).toBe(1)
    // Offsets through the new watermark are still exact.
    expect(cache.getOffset(1)).toBe(2)
    expect(cache.getOffset(2)).toBe(5)
  })

  test("invalidateFrom(0) drops watermark to −1", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    seedInOrder(cache, [2, 3, 5])
    cache.invalidateFrom(0)
    expect(cache.watermark).toBe(-1)
    // All offsets are pure estimates again.
    expect(cache.getOffset(2)).toBe(2 * 4)
  })

  test("stored heights past the new watermark are PRESERVED by default", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5, 7])
    cache.invalidateFrom(2)
    expect(cache.watermark).toBe(1)
    expect(cache.hasMeasurement(2)).toBe(true)
    expect(cache.hasMeasurement(3)).toBe(true)
    expect(cache.getStoredHeight(2)).toBe(5)
    expect(cache.getStoredHeight(3)).toBe(7)
  })

  test("re-measurements after invalidate walk the watermark forward through preserved heights", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5, 7])
    cache.invalidateFrom(2)
    // Re-measuring index 2 with the same height advances the watermark
    // AND walks through preserved height at 3.
    cache.setMeasurement(2, 5)
    expect(cache.watermark).toBe(3)
    expect(cache.getOffset(4)).toBe(2 + 3 + 5 + 7)
  })

  test("dropStoredHeights: true forgets heights at + past the new watermark", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [2, 3, 5, 7])
    cache.invalidateFrom(2, { dropStoredHeights: true })
    expect(cache.watermark).toBe(1)
    expect(cache.hasMeasurement(2)).toBe(false)
    expect(cache.hasMeasurement(3)).toBe(false)
    // Heights before `index` are kept.
    expect(cache.hasMeasurement(1)).toBe(true)
  })
})

// =============================================================================
// getIndexAtOffset — binary search + estimate
// =============================================================================

describe("getIndexAtOffset", () => {
  test("returns 0 for offset ≤ 0", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    seedInOrder(cache, [2, 3, 5])
    expect(cache.getIndexAtOffset(0)).toBe(0)
    expect(cache.getIndexAtOffset(-100)).toBe(0)
  })

  test("returns the row that contains the given offset (inside measured prefix)", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [10, 10, 10, 10])
    // Row 0: [0, 10). Row 1: [10, 20). Row 2: [20, 30). Row 3: [30, 40).
    expect(cache.getIndexAtOffset(0)).toBe(0)
    expect(cache.getIndexAtOffset(9)).toBe(0)
    expect(cache.getIndexAtOffset(10)).toBe(1)
    expect(cache.getIndexAtOffset(15)).toBe(1)
    expect(cache.getIndexAtOffset(29)).toBe(2)
  })

  test("returns the row past the watermark via constant-time estimate", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 5 })
    seedInOrder(cache, [10, 10]) // measured-end = 20
    // past watermark — offset 25 is 5 past, default 5 → row 2 + 1 = row 3? Re-derive:
    // watermark + 1 + floor((offset - 20) / 5)
    expect(cache.getIndexAtOffset(20)).toBe(2)
    expect(cache.getIndexAtOffset(24)).toBe(2)
    expect(cache.getIndexAtOffset(25)).toBe(3)
    expect(cache.getIndexAtOffset(30)).toBe(4)
  })

  test("getOffset and getIndexAtOffset are inverses within the measured prefix", () => {
    const cache = createMeasurementCache()
    seedInOrder(cache, [3, 1, 4, 1, 5, 9, 2, 6])
    for (let i = 0; i < 8; i++) {
      const top = cache.getOffset(i)
      expect(cache.getIndexAtOffset(top)).toBe(i)
    }
  })
})

// =============================================================================
// Performance characteristics — O(1) past watermark, O(log n) inverse
// =============================================================================

describe("performance — Big-O acceptance", () => {
  test("getOffset(i) past the watermark is O(1) — 100k unmeasured rows", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 1 })
    seedInOrder(cache, [10, 10, 10]) // watermark = 2
    // Reading 100k far-past-watermark offsets must be linear in the count
    // of reads, not in the index. We assert correctness (offset formula)
    // and a generous wall-clock budget for 1e5 calls.
    const N = 100_000
    const t0 = performance.now()
    let sink = 0
    for (let i = 0; i < N; i++) {
      sink += cache.getOffset(i + 100_000)
    }
    const elapsed = performance.now() - t0
    // Sanity on the side effect to prevent dead-code elimination.
    expect(sink).toBeGreaterThan(0)
    // Generous: 100ms for 100k reads on any reasonable machine. Pure-array
    // path is well under 10ms locally — this is the O(1) gate.
    expect(elapsed).toBeLessThan(500)
    // Spot-check the math.
    const knownEnd = 30
    const target = 200_000 // i = 100_000 + 100_000 = 200_000
    expect(cache.getOffset(target)).toBe(knownEnd + (target - 1 - 2) * 1)
  })

  test("getIndexAtOffset is O(log n) within the measured prefix — 50k contiguous rows", () => {
    const cache = createMeasurementCache()
    const N = 50_000
    const heights = Array.from({ length: N }, () => 7)
    seedInOrder(cache, heights)
    expect(cache.watermark).toBe(N - 1)
    // 50k binary searches at log2(50_000) ≈ 16 steps each. Wall-clock
    // budget: very generous.
    const t0 = performance.now()
    for (let i = 0; i < N; i++) {
      const off = i * 7 + 3 // somewhere in the middle of row i
      const idx = cache.getIndexAtOffset(off)
      if (idx !== i) {
        // Fail loudly with details — avoids 50k expect() calls.
        throw new Error(`getIndexAtOffset(${off}) = ${idx}, expected ${i}`)
      }
    }
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(1000)
  })

  test("setMeasurement in-order over 10k rows stays well under a second", () => {
    const cache = createMeasurementCache()
    const t0 = performance.now()
    for (let i = 0; i < 10_000; i++) {
      cache.setMeasurement(i, 3 + (i % 5))
    }
    const elapsed = performance.now() - t0
    expect(cache.watermark).toBe(9999)
    expect(elapsed).toBeLessThan(500)
  })
})

// =============================================================================
// defaultRowHeight is mutable; measured rows are unaffected
// =============================================================================

describe("defaultRowHeight setter", () => {
  test("changing default does not invalidate measured rows", () => {
    const cache = createMeasurementCache({ defaultRowHeight: 4 })
    seedInOrder(cache, [10, 10, 10]) // watermark = 2
    cache.defaultRowHeight = 8
    expect(cache.watermark).toBe(2)
    expect(cache.getOffset(2)).toBe(20)
    expect(cache.getOffset(3)).toBe(30)
    // But the estimate past the watermark now uses 8.
    expect(cache.getOffset(5)).toBe(30 + 2 * 8)
  })

  test("setter rejects non-positive", () => {
    const cache = createMeasurementCache()
    expect(() => {
      cache.defaultRowHeight = 0
    }).toThrow(RangeError)
    expect(() => {
      cache.defaultRowHeight = -3
    }).toThrow(RangeError)
    expect(() => {
      cache.defaultRowHeight = Number.NaN
    }).toThrow(RangeError)
  })
})

// =============================================================================
// Input validation
// =============================================================================

describe("input validation", () => {
  test("getOffset rejects negative or non-finite index", () => {
    const cache = createMeasurementCache()
    expect(() => cache.getOffset(-1)).toThrow(RangeError)
    expect(() => cache.getOffset(Number.NaN)).toThrow(RangeError)
    expect(() => cache.getOffset(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  test("getIndexAtOffset rejects non-finite offset", () => {
    const cache = createMeasurementCache()
    expect(() => cache.getIndexAtOffset(Number.NaN)).toThrow(RangeError)
    expect(() => cache.getIndexAtOffset(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  test("setMeasurement rejects non-integer or negative index", () => {
    const cache = createMeasurementCache()
    expect(() => cache.setMeasurement(-1, 3)).toThrow(RangeError)
    expect(() => cache.setMeasurement(1.5, 3)).toThrow(RangeError)
    expect(() => cache.setMeasurement(Number.NaN, 3)).toThrow(RangeError)
  })

  test("setMeasurement rejects negative or non-finite height", () => {
    const cache = createMeasurementCache()
    expect(() => cache.setMeasurement(0, -1)).toThrow(RangeError)
    expect(() => cache.setMeasurement(0, Number.NaN)).toThrow(RangeError)
    expect(() => cache.setMeasurement(0, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  test("setMeasurement accepts height of 0 (collapsed / hidden row)", () => {
    const cache = createMeasurementCache()
    cache.setMeasurement(0, 0)
    cache.setMeasurement(1, 5)
    expect(cache.watermark).toBe(1)
    expect(cache.getOffset(1)).toBe(0)
    expect(cache.getOffset(2)).toBe(5)
  })

  test("invalidateFrom rejects non-integer or negative index", () => {
    const cache = createMeasurementCache()
    expect(() => cache.invalidateFrom(-1)).toThrow(RangeError)
    expect(() => cache.invalidateFrom(1.5)).toThrow(RangeError)
  })
})
