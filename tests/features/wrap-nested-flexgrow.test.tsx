/**
 * Regression: <Text wrap=wrap> inside stacked flexGrow column/row chains
 * wraps at the parent's available width, not the outer max-content.
 *
 * Production trigger: a card column ("leftCol" with overflow="hidden") that
 * stacks a row+wrap layer over a per-session column over a SessionCard
 * column over an inner content column. A wrappable Text at the bottom of
 * that chain must wrap at the leftCol's content width — not get clipped by
 * the side panel.
 *
 * Companion silvercode-level test:
 *   apps/silvercode/tests/wrap-regression.test.tsx (mirrors App.tsx layout).
 *
 * IMPORTANT — root must have a definite height. silvercode's real root is
 * `<Screen>` (vendor/silvery/packages/ag-react/src/ui/components/Screen.tsx)
 * which sets `width={dims.width} height={dims.height}` from the terminal.
 * `createRenderer({cols, rows})` only passes cols/rows as available size to
 * `calculateLayout(width, height)` — it does NOT pin root.style.width/height.
 *
 * Without a definite root height, a column→row→wrappable-text chain collapses
 * to `height=1` via correct CSS max-content sizing: the row's intrinsic cross
 * size is its tallest child's max-content height, and a wrappable Text at
 * unconstrained width returns `height=1`. That cascades up to the row, the
 * outer column, and the root, which all become 1 row tall. Inside that 1-row
 * area, Text gets the right wrap width but only renders the first line.
 *
 * The misdiagnosed "residual flexily bug" (km-silvery.wrap-measurement) was
 * actually this test-harness artifact, not a layout-engine defect. Validation
 * by the silvery-expert agent confirmed: flexily Phase 7a's NaN×NaN measure
 * is CSS-correct shrink-wrap behavior. The screenshot bug was a separate issue
 * fixed by silvercode commits cdf14b592 + 363deaf6f (flexShrink/minWidth
 * propagation through DetectionText + AssistantBlock outer rows).
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const LONG =
  "This is km (Knowledge Machine) at /Code/pim/km — a TypeScript/Bun TUI workspace for agentic knowledge workers. It unifies notes, tasks, and calendar data with full history and bidirectional markdown sync, using TypeScript, Bun, SQLite, and Silvery for the React TUI."

const TOTAL_COLS = 160
const TOTAL_ROWS = 30
const SIDE_WIDTH = 40
const LEFT_WIDTH = TOTAL_COLS - SIDE_WIDTH

function findSide(text: string): number | null {
  for (const line of text.split("\n")) {
    const col = line.indexOf("SIDE_PANEL")
    if (col !== -1) return col
  }
  return null
}

/** Non-whitespace, non-side-panel content at columns >= boundary. */
function contentPastBoundary(text: string, boundary: number): string[] {
  const offenders: string[] = []
  for (const line of text.split("\n")) {
    if (line.length <= boundary) continue
    const right = line.slice(boundary).trim()
    if (right === "" || right.startsWith("SIDE_PANEL")) continue
    offenders.push(line)
  }
  return offenders
}

/** Pin width/height like `<Screen>` does in production. Tests must mirror
 *  the real app's root-sizing or they hit the column→row max-content collapse. */
function Root({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="row" width={TOTAL_COLS} height={TOTAL_ROWS}>
      {children}
    </Box>
  )
}

describe("wrap-nested-flexgrow: <Text wrap=wrap> inside stacked flexGrow chains", () => {
  test("3 nested flex-grow columns: text wraps at card boundary", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Root>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
              <Text wrap="wrap">{LONG}</Text>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Root>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    expect(sideCol).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)

    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })

  test("column → row(wrap) → column → text: wraps at card boundary", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Root>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              <Text wrap="wrap">{LONG}</Text>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Root>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })

  test("column → row(NO wrap) → column → text: wraps at card boundary", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Root>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              <Text wrap="wrap">{LONG}</Text>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Root>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
  })

  test("App.tsx chain: 5 nested flex-grow boxes wraps text", () => {
    // Mirrors apps/silvercode/src/App.tsx + SessionCard.tsx structure.
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Root>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              <Box
                flexDirection="column"
                flexGrow={1}
                flexShrink={1}
                minWidth={0}
                minHeight={0}
                overflow="hidden"
                paddingX={1}
              >
                <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
                  <Text wrap="wrap">{LONG}</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Root>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })

  test.skip("documents the harness-collapse pitfall: column→row→wrap-text WITHOUT root height collapses to 1 row", () => {
    // KEEP THIS TEST SKIPPED — it documents the harness pitfall that was
    // misdiagnosed as a flexily bug. If you find yourself filing a bead about
    // text not wrapping in a column→row chain, FIRST verify your root has a
    // definite height (use <Screen>, or pass width/height to the outer Box).
    //
    // Without root height, column→row→<Text wrap=wrap> chains collapse to 1
    // row by correct CSS max-content sizing: row's intrinsic cross =
    // max(child max-content cross), and wrappable Text at unconstrained width
    // = 1 row. The chain's heights cascade: row=1, column=1, root=1.
    //
    // See vendor/flexily/src/layout-zero.ts:947-952 (Phase 7a NaN×NaN).
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      // Note: NO root height — this is the antipattern.
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              <Text wrap="wrap">{LONG}</Text>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Box>,
    )
    const lines = app.text.split("\n")
    expect(lines.length).toBe(1) // collapsed to 1 row — chain cannot grow without root height
  })
})
