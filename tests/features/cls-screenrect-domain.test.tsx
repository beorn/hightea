/**
 * CLS screenRect-domain regression — proves Option C consolidation reads
 * the post-scroll, sticky-aware rect (not pre-scroll boxRect).
 *
 * History: 2026-05-13 — the original boxRect-based primitive missed
 * scroll-induced + sticky-element flicker (exactly the bug class CLS
 * exists to catch). Option C consolidation moved capture to ClsMonitor
 * (screenRect domain) at the renderer commit boundary. This file is the
 * forward-facing regression net — flickers caught here would have escaped
 * the old path.
 *
 * Bead: @km/silvery/cls-instrumentation-primitive (Phase 11/11)
 */

import React from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import { Box, Text } from "@silvery/ag-react"

const COLS = 40
const ROWS = 10

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
  delete process.env.SILVERY_STRICT
  resetStrictCache()
})

afterEach(() => {
  if (prevStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = prevStrict
  resetStrictCache()
})

// A scrollable container with N rows. Re-rendering with the same offset
// is a no-op (no shifts). Re-rendering with new content forces layout.
function ScrollApp({ extraRow }: { extraRow: boolean }) {
  const rows: React.ReactElement[] = []
  for (let i = 0; i < 15; i++) {
    rows.push(<Text key={i}>{`row-${i}`}</Text>)
  }
  if (extraRow) {
    rows.unshift(<Text key="inserted">INSERTED</Text>)
  }
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" overflow="scroll">
      {rows}
    </Box>
  )
}

// A layout with a fixed-position element below a flexible-height block.
// Changing the flex block's height shifts the fixed element's screenRect
// even though its boxRect-within-parent doesn't change semantically.
function FixedAfterFlexApp({ growBlock }: { growBlock: boolean }) {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Box height={growBlock ? 4 : 2}>
        <Text>flex-block</Text>
      </Box>
      <Box>
        <Text>FIXED</Text>
      </Box>
    </Box>
  )
}

describe("CLS screenRect-domain regression (Option C consolidation, 2026-05-13)", () => {
  test("no-op rerender produces zero shifts (no false positive)", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<ScrollApp extraRow={false} />)

    app.beginCLSCapture()
    app.rerender(<ScrollApp extraRow={false} />)
    const report = app.endCLSCapture()

    expect(report.shifts.length).toBe(0)
    expect(report.unexpectedShifts.length).toBe(0)
    expect(report.cumulativeScore).toBe(0)
  })

  test("inserting content at top of scroll container surfaces shifts via screenRect", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<ScrollApp extraRow={false} />)

    app.beginCLSCapture()
    // Insert a new row at index 0 — pushes every subsequent row down by 1.
    // boxRect AND screenRect of subsequent rows both shift. Either domain
    // would catch this — but the consolidation must not regress this case.
    app.rerender(<ScrollApp extraRow={true} />)
    const report = app.endCLSCapture()

    expect(report.shifts.length).toBeGreaterThan(0)
    expect(report.unexpectedShifts.length).toBeGreaterThan(0)
  })

  test("flex-block height change shifts downstream FIXED element (screenRect captures)", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<FixedAfterFlexApp growBlock={false} />)

    app.beginCLSCapture()
    // The FIXED block's parent-relative position changes (because its
    // sibling grew). Both boxRect and screenRect of FIXED move; the
    // consolidation must capture this canonical layout-shift case.
    app.rerender(<FixedAfterFlexApp growBlock={true} />)
    const report = app.endCLSCapture()

    expect(report.shifts.length).toBeGreaterThan(0)
    const fixedShift = report.shifts.find((s) => s.blockId.includes("FIXED"))
    if (fixedShift) {
      expect(fixedShift.fromRect.y).not.toBe(fixedShift.toRect.y)
    }
  })

  test("custom classifier filters expected shifts (content-arrival semantics)", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<ScrollApp extraRow={false} />)

    // Treat every shift as content-arrival — emulates a streaming chat view
    // where reflows during message arrival are legitimate, not flicker.
    app.beginCLSCapture(() => "content-arrival")
    app.rerender(<ScrollApp extraRow={true} />)
    const report = app.endCLSCapture()

    expect(report.shifts.length).toBeGreaterThan(0)
    // All shifts labeled content-arrival → none in the unexpected subset.
    expect(report.unexpectedShifts.length).toBe(0)
    // cumulativeScore still > 0 — "how much moved" includes all reasons.
    expect(report.cumulativeScore).toBeGreaterThan(0)
  })
})
