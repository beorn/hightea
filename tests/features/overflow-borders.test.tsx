/**
 * Overflow + Border Edge Case Tests
 *
 * Tests for:
 * - Multiple text nodes with border and word breaks
 * - Box intersecting left edge with border
 * - Out-of-bounds writes with border rendering
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("overflow border edge cases", () => {
  test("multiple text nodes with border: word breaks correctly", () => {
    const r = createRenderer({ cols: 20, rows: 10 })
    const app = r(
      <Box borderStyle="single" width={12}>
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Hello")
    expect(text).toContain("World")
    // Border should be intact
    const lines = text.split("\n")
    expect(lines[0]).toContain("┌")
    expect(lines[0]).toContain("┐")
  })

  test("box at x=0 with left border clips correctly", () => {
    // A box positioned at x=0 should render its left border at column 0
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" width={10}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer
    // Left border at x=0
    const topLeft = buffer.getCell(0, 0)
    expect(topLeft.char).toBe("┌")

    // Content should be inside the border
    const text = stripAnsi(app.text)
    expect(text).toContain("Test")
  })

  test("border rendering respects buffer boundaries", () => {
    // Border box near the edge of the terminal
    const r = createRenderer({ cols: 10, rows: 5 })
    const app = r(
      <Box borderStyle="single" width={10}>
        <Text>Content</Text>
      </Box>,
    )
    const buffer = app.term.buffer
    // Right border at the last column
    const topRight = buffer.getCell(9, 0)
    expect(topRight.char).toBe("┐")

    // Bottom right border
    const bottomRight = buffer.getCell(9, 2)
    expect(bottomRight.char).toBe("┘")
  })

  test("out-of-bounds border rendering does not crash", () => {
    // Box wider than terminal
    const r = createRenderer({ cols: 5, rows: 5 })
    // This should not throw even though the border extends past buffer width
    const app = r(
      <Box borderStyle="single" width={20}>
        <Text>Test</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Test")
  })

  test("hidden border with content does not corrupt layout", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" borderLeft={false} borderRight={false} width={10}>
        <Text>Content</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Content")
    const lines = text.split("\n")
    // Top border should have horizontal lines but no corners
    expect(lines[0]).toContain("─")
    expect(lines[0]).not.toContain("┌")
    expect(lines[0]).not.toContain("┐")
  })

  test("text overflowing LEFT edge of overflow=hidden border parent preserves border", () => {
    // Regression for km-flexily.overflow-clip-edges (Ink 7 compat overflow.tsx
    // test "overflowX - box intersecting with left edge of overflow container
    // with border"). A child with negative marginLeft inside an overflow:hidden
    // container with a border. Historically silvery wrote text starting at the
    // negative position, overwriting the parent's left border. With horizontal
    // left-clipping in renderText/renderGraphemes, the visible portion of the
    // text starts at clipBounds.left (col 1), preserving the border at col 0.
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box width={8} overflowX="hidden" borderStyle="round">
        <Box marginLeft={-3} width={12} flexShrink={0}>
          <Text>Hello World</Text>
        </Box>
      </Box>,
    )
    const text = stripAnsi(app.text)
    const lines = text.split("\n")
    // Line 0: top border 8 chars: ╭──────╮
    expect(lines[0]).toBe("╭──────╮")
    // Line 1: │lo Wor│ — left border preserved, visible text is "Hello World"
    // chars at indices 3..9 ("lo Wor"), right border preserved.
    expect(lines[1]).toBe("│lo Wor│")
    // Line 2: bottom border
    expect(lines[2]).toBe("╰──────╯")
  })
})
