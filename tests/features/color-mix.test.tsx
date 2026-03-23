/**
 * Tests for color="inherit" and mix(color1, color2, amount) syntax.
 *
 * - "inherit" returns null from parseColor, allowing parent color to flow through.
 * - mix() blends two RGB colors in sRGB space. Only works when both colors
 *   resolve to RGB objects (not ANSI indices or null).
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { parseColor } from "@silvery/term/pipeline/render-helpers"

// ============================================================================
// parseColor: inherit
// ============================================================================

describe("parseColor: inherit", () => {
  test("returns null for 'inherit'", () => {
    expect(parseColor("inherit")).toBeNull()
  })
})

// ============================================================================
// parseColor: mix()
// ============================================================================

describe("parseColor: mix()", () => {
  test("mix two hex colors at 50%", () => {
    const result = parseColor("mix(#ff0000, #0000ff, 50%)")
    expect(result).toEqual({ r: 128, g: 0, b: 128 })
  })

  test("mix at 0% returns first color", () => {
    const result = parseColor("mix(#ff0000, #0000ff, 0%)")
    expect(result).toEqual({ r: 255, g: 0, b: 0 })
  })

  test("mix at 100% returns second color", () => {
    const result = parseColor("mix(#ff0000, #0000ff, 100%)")
    expect(result).toEqual({ r: 0, g: 0, b: 255 })
  })

  test("mix with decimal notation (0.5 = 50%)", () => {
    const result = parseColor("mix(#ff0000, #0000ff, 0.5)")
    expect(result).toEqual({ r: 128, g: 0, b: 128 })
  })

  test("mix with 10% tint (subtle blend toward second color)", () => {
    const result = parseColor("mix(#1a1a2e, #4488ff, 10%)")
    expect(result).toBeTruthy()
    const c = result as { r: number; g: number; b: number }
    // 0x1a * 0.9 + 0x44 * 0.1 = 23.4 + 6.8 = 30.2 -> 30
    expect(c.r).toBeGreaterThanOrEqual(28)
    expect(c.r).toBeLessThanOrEqual(32)
    // 0x2e * 0.9 + 0xff * 0.1 = 41.4 + 25.5 = 66.9 -> 67
    expect(c.b).toBeGreaterThan(46) // tinted toward 0xff from original 0x2e=46
  })

  test("mix with rgb() colors", () => {
    const result = parseColor("mix(rgb(255, 0, 0), rgb(0, 0, 255), 50%)")
    expect(result).toEqual({ r: 128, g: 0, b: 128 })
  })

  test("mix with shorthand hex (#rgb)", () => {
    const result = parseColor("mix(#f00, #00f, 50%)")
    expect(result).toEqual({ r: 128, g: 0, b: 128 })
  })

  // Named colors are ANSI indices (numbers), not RGB objects.
  // mix() only blends RGB objects, so named colors return null.
  test("mix with named colors returns null (ANSI indices cannot blend)", () => {
    expect(parseColor("mix(white, black, 50%)")).toBeNull()
    expect(parseColor("mix(red, blue, 50%)")).toBeNull()
  })

  test("mix returns null for invalid syntax", () => {
    // Missing arguments
    expect(parseColor("mix()")).toBeNull()
    expect(parseColor("mix(red)")).toBeNull()
    expect(parseColor("mix(red, blue)")).toBeNull()
  })

  test("mix clamps amount to 0-1 range", () => {
    // Amount > 1 gets clamped to 1 (returns second color)
    const over = parseColor("mix(#ff0000, #0000ff, 200%)")
    expect(over).toEqual({ r: 0, g: 0, b: 255 })

    // Amount < 0 gets clamped to 0 (returns first color)
    const under = parseColor("mix(#ff0000, #0000ff, -50%)")
    expect(under).toEqual({ r: 255, g: 0, b: 0 })
  })

  test("mix with nested rgb() arguments (parenthesis-aware splitting)", () => {
    // The comma parser must handle nested parentheses correctly
    const result = parseColor("mix(rgb(100, 200, 50), rgb(200, 100, 150), 50%)")
    expect(result).toEqual({ r: 150, g: 150, b: 100 })
  })
})

// ============================================================================
// Renderer-level: color="inherit"
// ============================================================================

describe("color inherit in rendered output", () => {
  const render = createRenderer({ cols: 40, rows: 3 })

  test("inherit color from parent Text", () => {
    const app = render(
      <Text color="#ff0000">
        Parent <Text color="inherit">Inherited</Text>
      </Text>,
    )
    // Both "Parent" and "Inherited" should have the same red foreground
    const parentCol = app.text.indexOf("Parent")
    const inheritCol = app.text.indexOf("Inherited")
    const parentCell = app.term.buffer.getCell(parentCol, 0)
    const inheritCell = app.term.buffer.getCell(inheritCol, 0)
    expect(inheritCell.fg).toEqual(parentCell.fg)
  })

  test("inherit with no parent color yields null fg", () => {
    const app = render(
      <Text>
        Plain <Text color="inherit">Also plain</Text>
      </Text>,
    )
    const plainCol = app.text.indexOf("Plain")
    const inheritCol = app.text.indexOf("Also plain")
    const plainCell = app.term.buffer.getCell(plainCol, 0)
    const inheritCell = app.term.buffer.getCell(inheritCol, 0)
    // Both should have null (default) foreground
    expect(plainCell.fg).toBeNull()
    expect(inheritCell.fg).toBeNull()
  })
})

// ============================================================================
// Renderer-level: mix() colors
// ============================================================================

describe("mix() in rendered output", () => {
  const render = createRenderer({ cols: 40, rows: 3 })

  test("mix background color renders without crash", () => {
    const app = render(
      <Box backgroundColor="mix(#000000, #0000ff, 20%)">
        <Text>Blue tinted bg</Text>
      </Box>,
    )
    expect(app.text).toContain("Blue tinted bg")
  })

  test("mix foreground color applies to text", () => {
    const app = render(<Text color="mix(#ff0000, #0000ff, 50%)">Purple text</Text>)
    expect(app.text).toContain("Purple text")
    const cell = app.term.buffer.getCell(0, 0)
    // Should have the blended RGB color as foreground
    expect(cell.fg).toEqual({ r: 128, g: 0, b: 128 })
  })

  test("mix background color appears on cells", () => {
    const app = render(
      <Box backgroundColor="mix(#000000, #0000ff, 50%)" width={10} height={1}>
        <Text>X</Text>
      </Box>,
    )
    const cell = app.term.buffer.getCell(0, 0)
    // Background should be the blended color (~dark blue)
    expect(cell.bg).toEqual({ r: 0, g: 0, b: 128 })
  })
})
