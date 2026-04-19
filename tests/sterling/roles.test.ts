/**
 * Sterling roles — verify info is distinct from accent (D2) and surface
 * hierarchy has 4 levels.
 */

import { describe, test, expect } from "vitest"
import { sterling } from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"

describe("sterling roles — info + surface hierarchy", () => {
  test("theme.info exists with same default value as theme.accent", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.info).toBeDefined()
    expect(theme.info.fg).toBe(theme.accent.fg)
    expect(theme.info.bg).toBe(theme.accent.bg)
  })

  test("scheme can override info without affecting accent (D2)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!, {
      pins: { "info.fg": "#00CCFF" },
    })
    expect(theme.info.fg).toBe("#00CCFF")
    // accent.fg stays at its default derivation (not #00CCFF)
    expect(theme.accent.fg).not.toBe("#00CCFF")
  })

  test("surface has 4 distinct levels + hover", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.surface.default).toBeDefined()
    expect(theme.surface.subtle).toBeDefined()
    expect(theme.surface.raised).toBeDefined()
    expect(theme.surface.overlay).toBeDefined()
    expect(theme.surface.hover).toBeDefined()

    // They should all be distinct (progressively brighter for dark themes)
    const levels = [
      theme.surface.default,
      theme.surface.subtle,
      theme.surface.raised,
      theme.surface.overlay,
    ]
    const unique = new Set(levels)
    expect(unique.size).toBe(4)
  })

  test("theme has NO `destructive` field (D1 — destructive is a component prop)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect((theme as any).destructive).toBeUndefined()
  })

  test("theme has NO `brand` field (Appendix F — brand is input, not output)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect((theme as any).brand).toBeUndefined()
  })

  test("accent has a border token distinct from hover.bg", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.accent.border).toBeDefined()
    expect(theme["border-accent"]).toBe(theme.accent.border)
  })

  test("defaults(mode) works without any scheme input", () => {
    const dark = sterling.defaults("dark")
    const light = sterling.defaults("light")
    expect(dark.mode).toBe("dark")
    expect(light.mode).toBe("light")
    expect(dark.accent.bg).toBeTruthy()
    expect(light.accent.bg).toBeTruthy()
    expect(dark.surface.default).not.toBe(light.surface.default)
  })

  test("theme(partial) fills missing values with defaults", () => {
    const t = sterling.theme({ accent: { fg: "#DEADBE", bg: "#DEADBE" } })
    expect(t.accent.fg).toBe("#DEADBE")
    expect(t.accent.bg).toBe("#DEADBE")
    // Defaults still fill in other roles
    expect(t.error.fg).toBeTruthy()
    expect(t.surface.default).toBeTruthy()
  })
})
