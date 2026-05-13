/**
 * CLS Recorder — state machine + rect-recording unit tests.
 *
 * Pure-state tests — no pipeline, no React. Exercises the begin/record/end
 * contract that the pipeline hook (Phase 3) and termless API (Phase 5)
 * both depend on.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import { describe, expect, test } from "vitest"
import { createCLSRecorder, defaultClassifier, type ReasonClassifier } from "@silvery/ag/cls-recorder"
import type { Rect } from "@silvery/ag/types"

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, width: w, height: h })

describe("createCLSRecorder — initial state", () => {
  test("starts not-capturing", () => {
    expect(createCLSRecorder().isCapturing()).toBe(false)
  })

  test("recordRect is a no-op before beginCapture", () => {
    const rec = createCLSRecorder()
    rec.recordRect("A", rect(0, 0, 1, 1), rect(1, 0, 1, 1), 0)
    expect(rec.peekShifts()).toHaveLength(0)
  })

  test("endCapture throws when not capturing", () => {
    expect(() => createCLSRecorder().endCapture()).toThrow(/not capturing/)
  })

  test("cancelCapture is idempotent (no-op on fresh recorder)", () => {
    const rec = createCLSRecorder()
    rec.cancelCapture()
    rec.cancelCapture()
    expect(rec.isCapturing()).toBe(false)
  })
})

describe("createCLSRecorder — happy path", () => {
  test("begin → record → end produces a CLSReport with the shifts", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    rec.recordRect("B", rect(0, 0, 3, 3), rect(3, 4, 3, 3), 100)
    const report = rec.endCapture()
    expect(report.shifts).toHaveLength(2)
    expect(report.cumulativeScore).toBe(8 + 45)
    // Default classifier marks every shift unexpected.
    expect(report.unexpectedShifts).toHaveLength(2)
  })

  test("identical-rect record is dropped (no zero-score shift in shifts)", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), rect(0, 0, 4, 2), 100)
    expect(rec.endCapture().shifts).toHaveLength(0)
  })

  test("null prevRect (first paint) is dropped — no transition to score", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", null, rect(1, 0, 4, 2), 100)
    expect(rec.endCapture().shifts).toHaveLength(0)
  })

  test("null currRect (unmount) is dropped — no transition to score", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), null, 100)
    expect(rec.endCapture().shifts).toHaveLength(0)
  })

  test("endCapture resets internal state — next beginCapture starts clean", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    rec.endCapture()

    rec.beginCapture()
    expect(rec.peekShifts()).toHaveLength(0)
    expect(rec.isCapturing()).toBe(true)
    rec.endCapture()
  })

  test("peekShifts returns the live buffer mid-capture without ending", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    expect(rec.peekShifts()).toHaveLength(1)
    expect(rec.isCapturing()).toBe(true)
    // Capture is still open — can keep recording.
    rec.recordRect("B", rect(0, 0, 1, 1), rect(5, 5, 1, 1), 200)
    expect(rec.peekShifts()).toHaveLength(2)
    rec.cancelCapture()
  })
})

describe("createCLSRecorder — strict bracketing", () => {
  test("double beginCapture throws — caller bug if begin not paired with end", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    expect(() => rec.beginCapture()).toThrow(/already capturing/)
    rec.cancelCapture()
  })

  test("cancelCapture works mid-capture and resets state cleanly", () => {
    const rec = createCLSRecorder()
    rec.beginCapture()
    rec.recordRect("A", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    rec.cancelCapture()
    expect(rec.isCapturing()).toBe(false)
    expect(rec.peekShifts()).toHaveLength(0)
    expect(() => rec.endCapture()).toThrow(/not capturing/)
  })
})

describe("createCLSRecorder — classifier override", () => {
  test("custom classifier labels shifts by reason", () => {
    const classifier: ReasonClassifier = (blockId) => {
      if (blockId === "user-block") return "user-action"
      if (blockId === "stream-block") return "content-arrival"
      return "unexpected"
    }
    const rec = createCLSRecorder()
    rec.beginCapture(classifier)
    rec.recordRect("user-block", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    rec.recordRect("stream-block", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    rec.recordRect("rogue-block", rect(0, 0, 4, 2), rect(1, 0, 4, 2), 100)
    const report = rec.endCapture()
    expect(report.shifts.map((s) => s.reflowReason)).toEqual([
      "user-action",
      "content-arrival",
      "unexpected",
    ])
    expect(report.unexpectedShifts).toHaveLength(1)
    expect(report.unexpectedShifts[0].blockId).toBe("rogue-block")
  })

  test("classifier resets to default after endCapture", () => {
    const rec = createCLSRecorder()
    rec.beginCapture(() => "user-action")
    rec.recordRect("X", rect(0, 0, 1, 1), rect(1, 0, 1, 1), 0)
    expect(rec.endCapture().shifts[0].reflowReason).toBe("user-action")

    // Second capture without a classifier → defaultClassifier ("unexpected").
    rec.beginCapture()
    rec.recordRect("Y", rect(0, 0, 1, 1), rect(1, 0, 1, 1), 0)
    expect(rec.endCapture().shifts[0].reflowReason).toBe("unexpected")
  })
})

describe("defaultClassifier", () => {
  test("always returns 'unexpected' — most pessimistic default", () => {
    expect(defaultClassifier("A", rect(0, 0, 1, 1), rect(1, 0, 1, 1), 0)).toBe("unexpected")
    expect(defaultClassifier("B", rect(0, 0, 5, 5), rect(10, 10, 5, 5), 999999)).toBe("unexpected")
  })
})
