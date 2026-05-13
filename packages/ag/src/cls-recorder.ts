/**
 * CLS Recorder — per-instance state machine that accumulates layout shifts
 * during a capture window.
 *
 * Two callers:
 *   1. The pipeline (notify phase) calls `recordRect()` once per AgNode per
 *      frame with (prevRect, currRect). The recorder filters by
 *      `isCapturing()` so the call is a no-op outside capture windows.
 *   2. The termless capture API calls `beginCapture()` / `endCapture()` /
 *      `cancelCapture()` to bracket the window.
 *
 * One recorder per consumer (App / test harness / live runtime). Module-level
 * singleton is intentionally NOT provided — multiple Apps coexisting in one
 * process (test runners, future multi-window) need independent state.
 *
 * Pure: no React, no signals, no AgNode dependency. Takes Rect inputs.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import { aggregateReport, makeShift, type CLSReport, type LayoutShift, type ReflowReason } from "./cls"
import type { Rect } from "./types"

/**
 * Classifier function — given a block + rect transition, returns the
 * reflow reason. The pipeline-side wiring will pass a classifier that
 * inspects layout-phase context (user-action vs streamed content vs
 * unsolicited reflow). Default classifier returns "unexpected" — most
 * pessimistic, captures the bug class CLS is designed to detect.
 */
export type ReasonClassifier = (
  blockId: string,
  fromRect: Rect,
  toRect: Rect,
  frameTimestamp: number,
) => ReflowReason

export const defaultClassifier: ReasonClassifier = () => "unexpected"

export interface CLSRecorder {
  /** Whether capture is currently active. Pipeline check before recordRect. */
  isCapturing(): boolean

  /**
   * Start capture. Throws on double-open — tests + termless must bracket
   * begin/end correctly. Pass a classifier to override the default
   * (always-unexpected) labeling.
   */
  beginCapture(classifier?: ReasonClassifier): void

  /**
   * Record a single block's rect transition for the current frame. No-op
   * when not capturing OR when either rect is null (first paint, unmount).
   * Equal-rect transitions skip via makeShift's null-return.
   */
  recordRect(
    blockId: string,
    prevRect: Rect | null,
    currRect: Rect | null,
    frameTimestamp: number,
  ): void

  /**
   * End capture, return aggregated CLSReport, reset internal state. Throws
   * if not capturing (mirrors beginCapture's strictness — caller bug if
   * out of order).
   */
  endCapture(): CLSReport

  /**
   * Cancel capture without producing a report. Idempotent — safe to call
   * on a non-capturing recorder (used by termless cleanup paths).
   */
  cancelCapture(): void

  /**
   * Read the current shifts buffer without ending capture. Useful for
   * mid-capture inspection (debug logs, progress UIs). Does not reset state.
   */
  peekShifts(): readonly LayoutShift[]
}

export function createCLSRecorder(): CLSRecorder {
  let capturing = false
  let shifts: LayoutShift[] = []
  let activeClassifier: ReasonClassifier = defaultClassifier

  return {
    isCapturing(): boolean {
      return capturing
    },
    beginCapture(classifier?: ReasonClassifier): void {
      if (capturing) {
        throw new Error(
          "CLSRecorder.beginCapture: already capturing. Call endCapture() or cancelCapture() before starting a new window.",
        )
      }
      capturing = true
      shifts = []
      activeClassifier = classifier ?? defaultClassifier
    },
    recordRect(
      blockId: string,
      prevRect: Rect | null,
      currRect: Rect | null,
      frameTimestamp: number,
    ): void {
      if (!capturing) return
      // First paint or unmount — no transition to score.
      if (!prevRect || !currRect) return
      const reason = activeClassifier(blockId, prevRect, currRect, frameTimestamp)
      const shift = makeShift(blockId, prevRect, currRect, frameTimestamp, reason)
      if (shift !== null) shifts.push(shift)
    },
    endCapture(): CLSReport {
      if (!capturing) {
        throw new Error("CLSRecorder.endCapture: not capturing. Call beginCapture() first.")
      }
      const report = aggregateReport(shifts)
      capturing = false
      shifts = []
      activeClassifier = defaultClassifier
      return report
    },
    cancelCapture(): void {
      capturing = false
      shifts = []
      activeClassifier = defaultClassifier
    },
    peekShifts(): readonly LayoutShift[] {
      return shifts
    },
  }
}
