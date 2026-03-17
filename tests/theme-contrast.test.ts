/**
 * Verify contrast guarantees of the theme derivation system.
 *
 * These tests codify the minimum contrast ratios that deriveTheme() ensures
 * across all 43+ built-in palettes. See derive.ts header for the full table.
 */

import { describe, expect, it } from "vitest"
import { builtinPalettes, deriveTheme, checkContrast, ensureContrast } from "@silvery/theme"
import type { Theme } from "@silvery/theme"

// ── Contrast targets (from derive.ts) ────────────────────────────────

const AA = 4.5
const DIM = 3.0
const FAINT = 1.5
const SUBTLE = 2.0

// ── Test helpers ─────────────────────────────────────────────────────

function ratio(fg: string, bg: string): number {
  const r = checkContrast(fg, bg)
  return r?.ratio ?? 0
}

const palettes = Object.entries(builtinPalettes)

// ── ensureContrast unit tests ────────────────────────────────────────

describe("ensureContrast", () => {
  it("returns color unchanged when already meeting target", () => {
    const result = ensureContrast("#000000", "#FFFFFF", 4.5)
    expect(result).toBe("#000000")
  })

  it("darkens color on light background to meet target", () => {
    // Yellow on white — fails AA, should be darkened
    const adjusted = ensureContrast("#FFAB91", "#FFFFFF", 4.5)
    expect(ratio(adjusted, "#FFFFFF")).toBeGreaterThanOrEqual(4.5)
    // Should preserve hue (still warm/orange)
    expect(adjusted).not.toBe("#000000") // not just black
  })

  it("lightens color on dark background to meet target", () => {
    // Dark blue on dark bg — fails, should be lightened
    const adjusted = ensureContrast("#2E3440", "#1A1A2E", 4.5)
    expect(ratio(adjusted, "#1A1A2E")).toBeGreaterThanOrEqual(4.5)
  })

  it("returns non-hex color unchanged", () => {
    // Non-hex color string — can't parse, returned as-is
    expect(ensureContrast("red", "#FFFFFF", 4.5)).toBe("red")
  })
})

// ── Derived theme contrast guarantees ────────────────────────────────

describe("deriveTheme contrast guarantees", () => {
  // Text tokens on root background
  describe.each(palettes)("%s", (_name, palette) => {
    const theme = deriveTheme(palette)

    it("muted / bg >= AA (4.5:1)", () => {
      expect(ratio(theme.muted, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("muted / muted-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.muted, theme.mutedbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("disabled-fg / bg >= DIM (3.0:1)", () => {
      expect(ratio(theme.disabledfg, theme.bg)).toBeGreaterThanOrEqual(DIM - 0.01)
    })

    it("border / bg >= FAINT (1.5:1)", () => {
      expect(ratio(theme.border, theme.bg)).toBeGreaterThanOrEqual(FAINT - 0.01)
    })

    it("inputborder / bg >= SUBTLE (2.0:1)", () => {
      expect(ratio(theme.inputborder, theme.bg)).toBeGreaterThanOrEqual(SUBTLE - 0.01)
    })

    // Accent colors as text on root bg
    for (const token of ["primary", "error", "warning", "success", "info", "link"] as const) {
      it(`${token} / bg >= AA (4.5:1)`, () => {
        expect(ratio(theme[token], theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
      })
    }

    // Accent fg text on accent bg (badge readability)
    for (const token of ["primary", "secondary", "accent", "error", "warning", "success", "info"] as const) {
      it(`${token}-fg / ${token} >= AA (4.5:1)`, () => {
        const fg = theme[`${token}fg` as keyof Theme] as string
        const bg = theme[token] as string
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA - 0.01)
      })
    }

    it("selection / selection-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.selection, theme.selectionbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })
  })
})
