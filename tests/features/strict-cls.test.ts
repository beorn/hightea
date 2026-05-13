/**
 * STRICT cls — assertion behavior under the SILVERY_STRICT contract.
 *
 * Verifies the slug declaration + the assertion-on-unexpected-shifts
 * contract that `endCLSCapture()` and consumer-side close-gates rely on.
 *
 * Bead: km-silvery.cls-instrumentation-primitive (Phase 4/7).
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  assertNoUnexpectedShifts,
  CLS_STRICT_MIN_TIER,
  CLS_STRICT_SLUG,
  isClsStrictEnabled,
  UnexpectedLayoutShiftError,
} from "@silvery/ag-term/strict-cls"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { CLSReport, LayoutShift } from "@silvery/ag/cls"

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
})

afterEach(() => {
  if (prevStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = prevStrict
  }
  resetStrictCache()
})

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })

const unexpectedShift = (blockId: string): LayoutShift => ({
  blockId,
  fromRect: rect(0, 0, 4, 2),
  toRect: rect(3, 0, 4, 2),
  frameTimestamp: 100,
  reflowReason: "unexpected",
})

const goodReport: CLSReport = {
  shifts: [],
  cumulativeScore: 0,
  unexpectedShifts: [],
}

const badReport = (n: number): CLSReport => {
  const shifts: LayoutShift[] = Array.from({ length: n }, (_, i) => unexpectedShift(`block-${i}`))
  return { shifts, cumulativeScore: 24 * n, unexpectedShifts: shifts }
}

describe("CLS_STRICT_SLUG + CLS_STRICT_MIN_TIER", () => {
  test("slug is 'cls' (the SILVERY_STRICT slug consumers grep for)", () => {
    expect(CLS_STRICT_SLUG).toBe("cls")
  })

  test("min tier is 2 (paranoid — opt-in, not default)", () => {
    expect(CLS_STRICT_MIN_TIER).toBe(2)
  })
})

describe("isClsStrictEnabled — env-var integration", () => {
  test("false when SILVERY_STRICT is unset", () => {
    delete process.env.SILVERY_STRICT
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(false)
  })

  test("false when SILVERY_STRICT=0", () => {
    process.env.SILVERY_STRICT = "0"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(false)
  })

  test("false when SILVERY_STRICT=1 (tier 1 doesn't cover cls — too noisy for default fast pass)", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(false)
  })

  test("true when SILVERY_STRICT=2 (paranoid tier reaches cls)", () => {
    process.env.SILVERY_STRICT = "2"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(true)
  })

  test("true when SILVERY_STRICT=cls (explicit slug)", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(true)
  })

  test("false when SILVERY_STRICT=2,!cls (per-check skip)", () => {
    process.env.SILVERY_STRICT = "2,!cls"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(false)
  })

  test("true when SILVERY_STRICT=1,cls (mix-and-match slug on top of lower tier)", () => {
    process.env.SILVERY_STRICT = "1,cls"
    resetStrictCache()
    expect(isClsStrictEnabled()).toBe(true)
  })
})

describe("assertNoUnexpectedShifts", () => {
  test("no-op when SILVERY_STRICT is unset, even with unexpected shifts in report", () => {
    delete process.env.SILVERY_STRICT
    resetStrictCache()
    // Would throw if strict were on — verifies env gate is checked first.
    expect(() => assertNoUnexpectedShifts(badReport(3))).not.toThrow()
  })

  test("no-op when strict enabled but report has no unexpected shifts", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    expect(() => assertNoUnexpectedShifts(goodReport)).not.toThrow()
  })

  test("throws UnexpectedLayoutShiftError when strict enabled and report has unexpected shifts", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    expect(() => assertNoUnexpectedShifts(badReport(2))).toThrow(UnexpectedLayoutShiftError)
  })

  test("error carries shifts + score for programmatic inspection", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    try {
      assertNoUnexpectedShifts(badReport(3))
      expect.fail("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(UnexpectedLayoutShiftError)
      const err = e as UnexpectedLayoutShiftError
      expect(err.shifts).toHaveLength(3)
      expect(err.score).toBeGreaterThan(0)
      expect(err.message).toContain("3 unexpected layout shift(s)")
      expect(err.message).toContain("block-0")
    }
  })

  test("error message truncates the offender list at 5 + 'and N more' tail", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    try {
      assertNoUnexpectedShifts(badReport(10))
      expect.fail("should have thrown")
    } catch (e) {
      const err = e as UnexpectedLayoutShiftError
      expect(err.message).toContain("and 5 more")
      // Last shown is block-4 (first 5 of 10).
      expect(err.message).toContain("block-4")
      expect(err.message).not.toMatch(/block-5:/)
    }
  })

  test("no-op under SILVERY_STRICT=2,!cls — per-check skip wins", () => {
    process.env.SILVERY_STRICT = "2,!cls"
    resetStrictCache()
    expect(() => assertNoUnexpectedShifts(badReport(3))).not.toThrow()
  })
})
