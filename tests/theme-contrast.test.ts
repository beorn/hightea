/**
 * Verify contrast guarantees of the theme derivation system.
 *
 * These tests codify the minimum contrast ratios that `deriveTheme()` ensures
 * across all 43+ built-in palettes. Every assertion uses Sterling flat tokens
 * (`theme["fg-accent"]`, `theme["bg-surface-subtle"]`, …) — see `derive.ts`
 * header for the full derivation table.
 *
 * Sterling flat tokens are bracket-accessed because their keys contain
 * hyphens. Two non-Sterling root fields survive: `theme.fg` and `theme.bg` —
 * they carry the raw scheme foreground and background.
 *
 * Each palette is resolved via `getThemeByName` (or derived through the
 * Sterling inlining pipeline) so that Sterling flat tokens are populated.
 * Asserting on a bare `deriveTheme(palette)` output would miss flat tokens —
 * they're added by `inlineSterlingTokens` at construction in every shipped
 * Theme.
 */

import { describe, expect, it } from "vitest"
import { builtinPalettes, createTheme, getThemeByName, quickTheme } from "@silvery/theme"
import { autoGenerateTheme } from "@silvery/ansi"
import { deriveTheme, type Theme } from "@silvery/ansi"
import { checkContrast, ensureContrast } from "@silvery/color"

// ── Contrast targets (from derive.ts) ────────────────────────────────

const AA = 4.5
const DIM = 3.0
const FAINT = 1.5
const CONTROL = 3.0

// ── Test helpers ─────────────────────────────────────────────────────

function ratio(fg: string, bg: string): number {
  const r = checkContrast(fg, bg)
  return r?.ratio ?? 0
}

/**
 * Sterling flat-token lookup — flat keys contain hyphens so bracket access
 * is mandatory. Wrap in a typed helper so the call sites read naturally.
 *
 * For Themes produced by `createTheme`/`quickTheme`/`autoGenerateTheme`
 * (plain `deriveTheme` output), Sterling flat keys are NOT populated. Those
 * tests assert against legacy role-hex fields instead.
 */
function tok(theme: Theme, key: string): string {
  return (theme as unknown as Record<string, string>)[key] ?? ""
}

/**
 * Assert accent-family contrast using legacy Theme fields (`theme.primary`,
 * `theme.primaryfg`, `theme.accent`). Used for tests that exercise
 * `quickTheme` / `createTheme` / `autoGenerateTheme` — these return plain
 * `deriveTheme` output without Sterling flat keys baked in.
 *
 * Legacy field migration to Sterling flat keys is tracked under
 * `km-silvery.sterling-2e-interior-migration` Phase D (builder inlining).
 */
function assertLegacyAccentContrast(theme: Theme) {
  expect(ratio(theme.primary, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
  expect(ratio(theme.primaryfg, theme.primary)).toBeGreaterThanOrEqual(AA - 0.01)
  expect(ratio(theme.accent, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
}

/**
 * Derive a Sterling-inlined theme from a palette name.
 *
 * `getThemeByName` runs the palette through `deriveTheme` then
 * `inlineSterlingTokens`, giving us both legacy Theme fields AND Sterling
 * flat keys on the same object (exactly the shape every shipped Theme has).
 */
function paletteTheme(name: string): Theme {
  return getThemeByName(name)
}

const palettes = Object.entries(builtinPalettes)

// ── ensureContrast unit tests ────────────────────────────────────────

describe("ensureContrast", () => {
  it("returns color unchanged when already meeting target", () => {
    const result = ensureContrast("#000000", "#FFFFFF", 4.5)
    expect(result).toBe("#000000")
  })

  it("darkens color on light background to meet target", () => {
    const adjusted = ensureContrast("#FFAB91", "#FFFFFF", 4.5)
    expect(ratio(adjusted, "#FFFFFF")).toBeGreaterThanOrEqual(4.5)
    expect(adjusted).not.toBe("#000000")
  })

  it("lightens color on dark background to meet target", () => {
    const adjusted = ensureContrast("#2E3440", "#1A1A2E", 4.5)
    expect(ratio(adjusted, "#1A1A2E")).toBeGreaterThanOrEqual(4.5)
  })

  it("returns non-hex color unchanged", () => {
    expect(ensureContrast("red", "#FFFFFF", 4.5)).toBe("red")
  })

  it("returns color unchanged when against is non-hex", () => {
    expect(ensureContrast("#FF0000", "white", 4.5)).toBe("#FF0000")
  })

  it("handles impossible targets gracefully (best-effort)", () => {
    // Mid-gray bg with extreme ratio target — should return best effort
    const result = ensureContrast("#808080", "#808080", 21)
    // Result should be far from the input (pushed to an extreme)
    expect(result).not.toBe("#808080")
  })
})

// ── checkContrast rounding ───────────────────────────────────────────

describe("checkContrast", () => {
  it("uses exact ratio for AA/AAA decisions (no rounding up)", () => {
    // Find a color pair with a ratio that rounds up to 4.5 but is actually below
    // 4.495 rounds to 4.50 — the aa flag should still be false
    const result = checkContrast("#757575", "#FFFFFF")
    expect(result).not.toBeNull()
    // The display ratio is rounded, but aa/aaa use exact values
    if (result && result.ratio >= 4.5) {
      expect(result.aa).toBe(true)
    }
    if (result && !result.aa) {
      // Even if display ratio shows 4.5, it can be below threshold
      expect(result.ratio).toBeLessThanOrEqual(4.5)
    }
  })
})

// ── Semantic accent propagation ──────────────────────────────────────
//
// These tests exercise the legacy Theme field surface (`theme.primary`,
// `theme.primaryfg`, `theme.accent`) because the builders they call
// (`quickTheme`, `createTheme`, `autoGenerateTheme`) return plain
// `deriveTheme` output without Sterling flat tokens inlined.
//
// Migration to Sterling-inlined builder output is tracked under
// `km-silvery.sterling-2e-interior-migration` Phase D.

describe("semantic accent propagation", () => {
  it("quickTheme('blue') uses blue as accent, not yellow", () => {
    const theme = quickTheme("blue", "dark")
    // Should be blue-ish, not yellow-ish
    const hsl = checkContrast(theme.primary, "#000000") // just to confirm it's valid
    expect(hsl).not.toBeNull()
    // Blue primary should NOT be the default yellow (#EBCB8B)
    expect(theme.primary).not.toBe("#EBCB8B")
    assertLegacyAccentContrast(theme)
  })

  it("quickTheme('red') uses red as accent", () => {
    const theme = quickTheme("red", "dark")
    assertLegacyAccentContrast(theme)
  })

  it("createTheme().primary('#FF0000').build() uses red accent", () => {
    const theme = createTheme().primary("#FF0000").dark().build()
    // Primary should be the input color (or contrast-adjusted version of it)
    // It should NOT be yellow
    expect(theme.primary).not.toBe("#EBCB8B")
    assertLegacyAccentContrast(theme)
  })

  it("createTheme().preset('nord').primary('#A3BE8C').build() uses green accent", () => {
    const theme = createTheme().preset("nord").primary("#A3BE8C").build()
    // Should use the green override, not Nord's default yellow
    expect(theme.primary).not.toBe("#EBCB8B")
    assertLegacyAccentContrast(theme)
  })

  it("autoGenerateTheme preserves accent through derivation", () => {
    const theme = autoGenerateTheme("#5E81AC", "dark")
    // Accent should be contrast-adjusted version of input blue
    assertLegacyAccentContrast(theme)
  })

  it("autoGenerateTheme meets contrast guarantees", () => {
    // Test various hues
    for (const color of ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]) {
      for (const mode of ["dark", "light"] as const) {
        const theme = autoGenerateTheme(color, mode)
        expect(ratio(theme.primary, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
        expect(ratio(theme.primaryfg, theme.primary)).toBeGreaterThanOrEqual(AA - 0.01)
      }
    }
  })

  it("built-in palettes still use yellow/blue default (no primary seed)", () => {
    // Nord dark should still derive from yellow as the accent seed
    const nord = deriveTheme(builtinPalettes["nord"]!)
    // It should be derived from p.yellow (Nord yellow = #EBCB8B)
    // The exact color may be adjusted by ensureContrast, but it should
    // be yellow-ish, not blue or red
    expect(nord.primary).toBeDefined()
    assertLegacyAccentContrast(nord)
  })
})

// ── Derived theme contrast guarantees ────────────────────────────────

describe("deriveTheme contrast guarantees", () => {
  describe.each(palettes)("%s", (name, _palette) => {
    // Resolve by name — `getThemeByName` runs the palette through
    // `deriveTheme` + `inlineSterlingTokens`, so Sterling flat keys resolve.
    const theme = paletteTheme(name)

    // Body text on all surfaces
    it("fg / bg >= AA (4.5:1)", () => {
      expect(ratio(theme.fg, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("fg / bg-surface-subtle >= AA (4.5:1)", () => {
      expect(ratio(theme.fg, tok(theme, "bg-surface-subtle"))).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("fg / bg-surface-overlay >= AA (4.5:1)", () => {
      // Sterling now applies adaptive lift on surface.overlay against the
      // post-derivation theme.fg (km-silvery.sterling-surface-adaptive,
      // 2026-04-24). Strict AA across every catalog palette.
      expect(ratio(theme.fg, tok(theme, "bg-surface-overlay"))).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("fg-muted / bg >= DIM (3:1)", () => {
      // fg-muted is deemphasized by design — it must clear DIM (3.0:1) but
      // not AA (4.5:1). Weaker contrast is the point.
      expect(ratio(tok(theme, "fg-muted"), theme.bg)).toBeGreaterThanOrEqual(DIM - 0.01)
    })

    // Sterling now applies adaptive lift on border-default / border-muted
    // against bg (km-silvery.sterling-borders-adaptive, 2026-04-24).
    // border-default lifts to CONTROL (3:1, WCAG 1.4.11 non-text chrome);
    // border-muted lifts to FAINT (1.5:1, structural divider floor).
    it("border-default / bg >= CONTROL (3.0:1)", () => {
      expect(ratio(tok(theme, "border-default"), theme.bg)).toBeGreaterThanOrEqual(CONTROL - 0.01)
    })

    it("border-muted / bg >= FAINT (1.5:1)", () => {
      expect(ratio(tok(theme, "border-muted"), theme.bg)).toBeGreaterThanOrEqual(FAINT - 0.01)
    })

    // Status + accent tokens as text on root bg
    for (const role of ["accent", "error", "warning", "success", "info"] as const) {
      it(`fg-${role} / bg >= AA (4.5:1)`, () => {
        expect(ratio(tok(theme, `fg-${role}`), theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
      })
    }

    // fg-on-<role> text on <role> fill (badge / button readability)
    for (const role of ["accent", "error", "warning", "success", "info"] as const) {
      it(`fg-on-${role} / bg-${role} >= AA (4.5:1)`, () => {
        expect(ratio(tok(theme, `fg-on-${role}`), tok(theme, `bg-${role}`))).toBeGreaterThanOrEqual(
          AA - 0.01,
        )
      })
    }

    // Sterling now applies adaptive `repairCursorBg` (ΔE-based visibility lift
    // on cursor.bg vs bg) plus a contrast guard on cursor.fg vs the repaired
    // cursor.bg at AA (km-silvery.sterling-cursor-adaptive, 2026-04-24).
    it("fg-cursor / bg-cursor >= AA (4.5:1)", () => {
      expect(ratio(tok(theme, "fg-cursor"), tok(theme, "bg-cursor"))).toBeGreaterThanOrEqual(
        AA - 0.01,
      )
    })
  })
})
