/**
 * Regression: an absolute-positioned child must clear its old painted cells
 * when its `top` prop changes. The bug originally surfaced as a stuck
 * ListView scroll thumb — the new thumb position painted correctly but the
 * old cells remained, so the thumb appeared to "smear" across rows during
 * fast scrolling.
 *
 * The three test scenarios are scaled down from the original ListView shape:
 *   1. simple move (5×5 grid, single absolute child)
 *   2. scroll-container sibling (20×5 grid, mimics scroll-area + thumb)
 *   3. multi-key children (a thumb composed of N keyed <Text> rows that
 *      themselves get re-keyed when firstRow changes — closest to ListView)
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("absolute child move clears old position", () => {
  test("simple move row 0 -> 1", () => {
    function Harness({ top }: { top: number }) {
      return (
        <Box position="relative" width={5} height={5} flexDirection="column">
          <Text>aaaaa</Text>
          <Text>bbbbb</Text>
          <Text>ccccc</Text>
          <Text>ddddd</Text>
          <Text>eeeee</Text>
          <Box position="absolute" top={top} right={0} width={1} flexDirection="column">
            <Text>X</Text>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 5, rows: 5 })
    const app = render(<Harness top={0} />)
    expect(app.text).toContain("aaaaX")

    app.rerender(<Harness top={1} />)
    expect(app.text).toContain("bbbbX")
    expect(app.cell(4, 0).char).toBe("a")
  })

  test("move with scroll container sibling", () => {
    function Harness({ top }: { top: number }) {
      return (
        <Box position="relative" flexDirection="column" width={20} height={5}>
          <Box overflow="scroll" width={20} flexGrow={1} flexShrink={1}>
            <Text>line 0 of content</Text>
            <Text>line 1 of content</Text>
            <Text>line 2 of content</Text>
            <Text>line 3 of content</Text>
            <Text>line 4 of content</Text>
            <Text>line 5 of content</Text>
            <Text>line 6 of content</Text>
            <Text>line 7 of content</Text>
            <Text>line 8 of content</Text>
            <Text>line 9 of content</Text>
          </Box>
          <Box position="absolute" top={top} right={0} width={1} flexDirection="column">
            <Text>X</Text>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Harness top={0} />)
    expect(app.cell(19, 0).char).toBe("X")

    app.rerender(<Harness top={1} />)
    expect(app.cell(19, 1).char).toBe("X")
    // The cell at (19,0) MUST not be X (stale)
    expect(app.cell(19, 0).char).not.toBe("X")
  })

  test("multiple absolute children with key changes (mimic ListView thumb)", () => {
    function Harness({ firstRow }: { firstRow: number }) {
      const lastRow = firstRow + 2
      const rows: React.ReactNode[] = []
      for (let r = firstRow; r <= lastRow; r++) {
        rows.push(<Text key={r}>X</Text>)
      }
      return (
        <Box position="relative" flexDirection="column" width={20} height={5}>
          <Box overflow="scroll" width={20} flexGrow={1} flexShrink={1}>
            <Text>line 0 of content</Text>
            <Text>line 1 of content</Text>
            <Text>line 2 of content</Text>
            <Text>line 3 of content</Text>
            <Text>line 4 of content</Text>
            <Text>line 5 of content</Text>
            <Text>line 6 of content</Text>
          </Box>
          <Box position="absolute" top={firstRow} right={0} width={1} flexDirection="column">
            {rows}
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Harness firstRow={0} />)
    // Thumb spans rows 0-2 at col 19
    expect(app.cell(19, 0).char).toBe("X")
    expect(app.cell(19, 1).char).toBe("X")
    expect(app.cell(19, 2).char).toBe("X")

    app.rerender(<Harness firstRow={1} />)
    // Now spans 1-3
    expect(app.cell(19, 1).char).toBe("X")
    expect(app.cell(19, 2).char).toBe("X")
    expect(app.cell(19, 3).char).toBe("X")
    // (19,0) must be cleared
    expect(app.cell(19, 0).char).not.toBe("X")
  })
})
