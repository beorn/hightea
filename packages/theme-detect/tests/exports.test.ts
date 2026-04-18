/**
 * Tests verifying @silvery/theme-detect exports are all reachable + functional.
 *
 * This is a thin-re-export package; we test that every promised surface is
 * actually exported and callable. No behavioral re-testing — that lives in
 * @silvery/ansi's test suite.
 */

import { describe, expect, it } from "vitest"
import {
  // Detection
  detectTerminalScheme,
  detectTheme,
  // BgMode
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
  // Capability
  detectTerminalCaps,
  defaultCaps,
  // Catalog primitives
  defaultDarkScheme,
  defaultLightScheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  // Fingerprinting
  fingerprintMatch,
  fingerprintCandidates,
  // Derivation
  deriveTheme,
  loadTheme,
  // Invariants
  validateThemeInvariants,
  formatViolations,
  ThemeInvariantError,
  AA_RATIO,
  LARGE_RATIO,
  FAINT_RATIO,
  SELECTION_DELTA_L,
  CURSOR_DELTA_E,
  // Monochrome
  deriveMonochromeTheme,
  monoAttrsFor,
  DEFAULT_MONO_ATTRS,
  // Custom tokens
  defineTokens,
  resolveCustomToken,
  CustomTokenError,
  // Types (compile-time check — import ensures type is reachable)
  COLOR_SCHEME_FIELDS,
} from "@silvery/theme-detect"
import type { ColorScheme, Theme, BgMode } from "@silvery/theme-detect"

describe("@silvery/theme-detect — exports", () => {
  it("exports detection functions", () => {
    expect(detectTerminalScheme).toBeTypeOf("function")
    expect(detectTheme).toBeTypeOf("function")
  })

  it("exports BgMode detection functions", () => {
    expect(createBgModeDetector).toBeTypeOf("function")
    expect(parseBgModeResponse).toBeTypeOf("function")
    expect(typeof ENABLE_BG_MODE_REPORTING).toBe("string")
    expect(typeof DISABLE_BG_MODE_REPORTING).toBe("string")
  })

  it("exports capability detection", () => {
    expect(detectTerminalCaps).toBeTypeOf("function")
    expect(defaultCaps).toBeDefined()
  })

  it("exports scheme catalog primitives", () => {
    expect(defaultDarkScheme.background).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(defaultLightScheme.background).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(ansi16DarkTheme).toBeDefined()
    expect(ansi16LightTheme).toBeDefined()
  })

  it("exports fingerprint functions", () => {
    expect(fingerprintMatch).toBeTypeOf("function")
    expect(fingerprintCandidates).toBeTypeOf("function")
  })

  it("exports derivation functions", () => {
    expect(deriveTheme).toBeTypeOf("function")
    expect(loadTheme).toBeTypeOf("function")
  })

  it("exports invariant validation + thresholds", () => {
    expect(validateThemeInvariants).toBeTypeOf("function")
    expect(formatViolations).toBeTypeOf("function")
    expect(ThemeInvariantError).toBeTypeOf("function")
    expect(AA_RATIO).toBe(4.5)
    expect(LARGE_RATIO).toBe(3.0)
    expect(FAINT_RATIO).toBe(1.5)
    expect(SELECTION_DELTA_L).toBe(0.08)
    expect(CURSOR_DELTA_E).toBe(0.15)
  })

  it("exports monochrome primitives", () => {
    expect(deriveMonochromeTheme).toBeTypeOf("function")
    expect(monoAttrsFor).toBeTypeOf("function")
    expect(DEFAULT_MONO_ATTRS).toBeTypeOf("object")
  })

  it("exports custom token primitives", () => {
    expect(defineTokens).toBeTypeOf("function")
    expect(resolveCustomToken).toBeTypeOf("function")
    expect(CustomTokenError).toBeTypeOf("function")
  })

  it("exports type constants", () => {
    expect(Array.isArray(COLOR_SCHEME_FIELDS)).toBe(true)
    expect(COLOR_SCHEME_FIELDS.length).toBe(22)
  })

  it("types are reachable (compile check)", () => {
    const scheme: ColorScheme = defaultDarkScheme
    const theme: Theme = deriveTheme(scheme)
    const mode: BgMode = "dark"
    expect(scheme).toBeDefined()
    expect(theme.fg).toBeDefined()
    expect(mode).toBe("dark")
  })
})

describe("@silvery/theme-detect — end-to-end flow", () => {
  it("detect → fingerprint → loadTheme pipeline works", () => {
    // Simulate a "terminal" by using defaultDarkScheme as the probed input.
    const probed = defaultDarkScheme
    const match = fingerprintMatch(probed, [defaultDarkScheme, defaultLightScheme])
    expect(match).not.toBeNull()
    expect(match!.scheme.name).toBe(defaultDarkScheme.name)

    const theme = loadTheme(match!.scheme, { enforce: "strict" })
    expect(theme.fg).toBeDefined()
    expect(theme.primary).toBeDefined()
  })

  it("loadTheme with wcag: true passes for default-dark", () => {
    const theme = loadTheme(defaultDarkScheme, { enforce: "strict", wcag: true })
    expect(theme).toBeDefined()
  })

  it("defineTokens + resolveCustomToken round-trip", () => {
    const tokens = defineTokens({
      "$priority-p0": { derive: (s) => s.brightRed },
      "$app-brand": { rgb: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
    })
    const theme = deriveTheme(defaultDarkScheme)
    const p0 = resolveCustomToken("$priority-p0", tokens, defaultDarkScheme, theme, "truecolor")
    expect(p0).toBe(defaultDarkScheme.brightRed)
    const brand = resolveCustomToken("$app-brand", tokens, defaultDarkScheme, theme, "ansi16")
    expect(brand).toBe("brightBlue")
  })
})
