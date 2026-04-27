/**
 * Regression: Tier 1 scroll buffer shift must not corrupt absolute overlay
 * pixels from sibling absolute children.
 *
 * Bead: km-silvery.listview-test-failures
 *
 * Setup mirrors ListView's structure:
 *
 *   <Box position="relative">          ← outer parent
 *     <Box overflow="scroll">          ← scroll container (Tier 1 candidate)
 *       <Text>row 0</Text>             ← items
 *       ...
 *     </Box>
 *     <Box position="absolute"         ← absolute sibling (scrollbar thumb)
 *          top={thumbTop} right={0}>
 *       <Text>X</Text>
 *     </Box>
 *   </Box>
 *
 * When the scroll container shifts buffer pixels (Tier 1 path), it shifts
 * pixels in its rect — INCLUDING any absolute sibling overlay pixels painted
 * during the previous frame at col=width-1. Without the
 * `hasOverlappingAbsoluteSibling` gate added to `planScrollRender`, the
 * absolute overlay would smear into wrong rows.
 *
 * The full repro requires Tier 1 to actually fire. SILVERY_STRICT (enabled
 * by default for vendor tests) catches the corruption regardless of how
 * the buffer mismatch is triggered — incremental render diverges from a
 * fresh render at the smeared cells.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("Tier 1 scroll shift with absolute overlay sibling", () => {
  test("scroll offset changes do not smear absolute sibling overlay pixels", () => {
    const COLS = 40
    const ROWS = 10
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ scrollOffset, thumbTop }: { scrollOffset: number; thumbTop: number }) {
      const items = Array.from({ length: 30 }, (_, i) => i)
      return (
        <Box position="relative" width={COLS} height={ROWS} flexDirection="column">
          <Box width={COLS} height={ROWS} overflow="scroll" scrollOffset={scrollOffset}>
            {items.map((i) => (
              <Text key={i}>row {i}</Text>
            ))}
          </Box>
          {/* Absolute sibling overlay at col=COLS-1 (rightmost) — same shape
           * as ListView's scrollbar thumb. */}
          <Box position="absolute" top={thumbTop} right={0} width={1} flexDirection="column">
            <Text>X</Text>
            <Text>X</Text>
            <Text>X</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<Harness scrollOffset={0} thumbTop={0} />)

    // Initial: thumb at top=0 — X at (39,0), (39,1), (39,2). Scroll offset 0.
    expect(app.cell(39, 0).char).toBe("X")
    expect(app.cell(39, 1).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")

    // Re-render with different scroll offset, SAME thumbTop. SILVERY_STRICT
    // verifies the incremental buffer matches a fresh render — without the
    // Tier 1 sibling-overlap gate, this would mismatch where the buffer
    // shift smeared the X pixels.
    app.rerender(<Harness scrollOffset={3} thumbTop={0} />)
    expect(app.cell(39, 0).char).toBe("X")
    expect(app.cell(39, 1).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")

    // More re-renders to provoke additional shifts.
    app.rerender(<Harness scrollOffset={5} thumbTop={0} />)
    expect(app.cell(39, 0).char).toBe("X")
    expect(app.cell(39, 1).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")

    app.rerender(<Harness scrollOffset={8} thumbTop={0} />)
    expect(app.cell(39, 0).char).toBe("X")
    expect(app.cell(39, 1).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")
  })

  test("absolute thumb moves while content scrolls — no smearing of old thumb position", () => {
    const COLS = 40
    const ROWS = 10
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ scrollOffset, thumbTop }: { scrollOffset: number; thumbTop: number }) {
      const items = Array.from({ length: 30 }, (_, i) => i)
      return (
        <Box position="relative" width={COLS} height={ROWS} flexDirection="column">
          <Box width={COLS} height={ROWS} overflow="scroll" scrollOffset={scrollOffset}>
            {items.map((i) => (
              <Text key={i}>row {i}</Text>
            ))}
          </Box>
          <Box position="absolute" top={thumbTop} right={0} width={1} flexDirection="column">
            <Text>X</Text>
            <Text>X</Text>
            <Text>X</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<Harness scrollOffset={0} thumbTop={0} />)
    expect(app.cell(39, 0).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")

    // Move both content and thumb together (shape ListView produces).
    app.rerender(<Harness scrollOffset={2} thumbTop={1} />)
    // Old thumb position (39,0) should be empty, new position should have X.
    expect(app.cell(39, 0).char).not.toBe("X")
    expect(app.cell(39, 1).char).toBe("X")
    expect(app.cell(39, 2).char).toBe("X")
    expect(app.cell(39, 3).char).toBe("X")
  })
})
