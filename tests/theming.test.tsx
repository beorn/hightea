/**
 * Tests for the inkx theming system.
 *
 * Verifies:
 * - resolveThemeColor() function
 * - ThemeProvider + useTheme() context delivery
 * - $token resolution in Text and Box color props
 * - Default theme values
 * - Theme switching via re-render
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext.js"
import { defaultDarkTheme, defaultLightTheme, resolveThemeColor, type Theme } from "../src/theme.js"
import { createRenderer, stripAnsi } from "../src/testing/index.tsx"

const render = createRenderer({ cols: 60, rows: 10 })

// ============================================================================
// resolveThemeColor
// ============================================================================

describe("resolveThemeColor", () => {
  test("returns undefined for undefined input", () => {
    expect(resolveThemeColor(undefined, defaultDarkTheme)).toBeUndefined()
  })

  test("returns undefined for empty string", () => {
    expect(resolveThemeColor("", defaultDarkTheme)).toBeUndefined()
  })

  test("passes through non-token strings unchanged", () => {
    expect(resolveThemeColor("red", defaultDarkTheme)).toBe("red")
    expect(resolveThemeColor("#ff0000", defaultDarkTheme)).toBe("#ff0000")
    expect(resolveThemeColor("rgb(255,0,0)", defaultDarkTheme)).toBe("rgb(255,0,0)")
  })

  test("resolves $primary to theme.primary", () => {
    expect(resolveThemeColor("$primary", defaultDarkTheme)).toBe("#88C0D0")
  })

  test("resolves all color tokens", () => {
    const tokens: Array<[string, string]> = [
      ["$primary", defaultDarkTheme.primary],
      ["$accent", defaultDarkTheme.accent],
      ["$error", defaultDarkTheme.error],
      ["$warning", defaultDarkTheme.warning],
      ["$success", defaultDarkTheme.success],
      ["$surface", defaultDarkTheme.surface],
      ["$background", defaultDarkTheme.background],
      ["$text", defaultDarkTheme.text],
      ["$muted", defaultDarkTheme.muted],
      ["$border", defaultDarkTheme.border],
    ]

    for (const [token, expected] of tokens) {
      expect(resolveThemeColor(token, defaultDarkTheme)).toBe(expected)
    }
  })

  test("passes through unknown $tokens as-is", () => {
    expect(resolveThemeColor("$nonexistent", defaultDarkTheme)).toBe("$nonexistent")
  })

  test("does not resolve $name or $dark (non-color metadata)", () => {
    // $name resolves to the string "dark" which is a valid string, so it passes
    expect(resolveThemeColor("$name", defaultDarkTheme)).toBe("dark")
    // $dark is boolean, not string — falls through
    expect(resolveThemeColor("$dark", defaultDarkTheme)).toBe("$dark")
  })

  test("resolves against light theme", () => {
    expect(resolveThemeColor("$primary", defaultLightTheme)).toBe("#5E81AC")
    expect(resolveThemeColor("$text", defaultLightTheme)).toBe("#2E3440")
  })
})

// ============================================================================
// Default themes
// ============================================================================

describe("default themes", () => {
  test("dark theme has expected metadata", () => {
    expect(defaultDarkTheme.name).toBe("dark")
    expect(defaultDarkTheme.dark).toBe(true)
  })

  test("light theme has expected metadata", () => {
    expect(defaultLightTheme.name).toBe("light")
    expect(defaultLightTheme.dark).toBe(false)
  })

  test("all color tokens are hex strings", () => {
    const colorKeys = [
      "primary",
      "accent",
      "error",
      "warning",
      "success",
      "surface",
      "background",
      "text",
      "muted",
      "border",
    ] as const

    for (const key of colorKeys) {
      expect(defaultDarkTheme[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(defaultLightTheme[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

// ============================================================================
// ThemeProvider + useTheme
// ============================================================================

describe("ThemeProvider + useTheme", () => {
  test("useTheme returns defaultDarkTheme without provider", () => {
    function ThemeDisplay() {
      const theme = useTheme()
      return <Text>{theme.name}</Text>
    }

    const app = render(<ThemeDisplay />)
    expect(app.text).toContain("dark")
  })

  test("useTheme returns provided theme", () => {
    function ThemeDisplay() {
      const theme = useTheme()
      return <Text>{theme.name}</Text>
    }

    const app = render(
      <ThemeProvider theme={defaultLightTheme}>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(app.text).toContain("light")
  })

  test("custom theme is accessible via useTheme", () => {
    const custom: Theme = {
      ...defaultDarkTheme,
      name: "solarized",
      primary: "#268BD2",
    }

    function ThemeDisplay() {
      const theme = useTheme()
      return (
        <Text>
          {theme.name}:{theme.primary}
        </Text>
      )
    }

    const app = render(
      <ThemeProvider theme={custom}>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(app.text).toContain("solarized")
    expect(app.text).toContain("#268BD2")
  })
})

// ============================================================================
// $token resolution in Text
// ============================================================================

/**
 * Convert a hex color to its RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

describe("$token resolution in Text", () => {
  test("Text with color=$primary uses theme primary color", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Text color="$primary">Hello</Text>
      </ThemeProvider>,
    )

    const frame = app.ansi
    // #88C0D0 = rgb(136, 192, 208) → ANSI: 38;2;136;192;208
    const { r, g, b } = hexToRgb(defaultDarkTheme.primary)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(frame)).toContain("Hello")
  })

  test("Text with backgroundColor=$surface uses theme surface color", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Text backgroundColor="$surface">Hello</Text>
      </ThemeProvider>,
    )

    const frame = app.ansi
    // #3B4252 = rgb(59, 66, 82) → ANSI: 48;2;59;66;82
    const { r, g, b } = hexToRgb(defaultDarkTheme.surface)
    expect(frame).toContain(`48;2;${r};${g};${b}`)
  })

  test("Text with literal color passes through unchanged", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Text color="red">Hello</Text>
      </ThemeProvider>,
    )

    const frame = app.ansi
    // "red" should NOT be resolved as a token
    expect(stripAnsi(frame)).toContain("Hello")
    // Should NOT contain the primary color
    const { r, g, b } = hexToRgb(defaultDarkTheme.primary)
    expect(frame).not.toContain(`38;2;${r};${g};${b}`)
  })
})

// ============================================================================
// $token resolution in Box
// ============================================================================

describe("$token resolution in Box", () => {
  test("Box with borderColor=$border uses theme border color", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box borderStyle="single" borderColor="$border">
          <Text>inside</Text>
        </Box>
      </ThemeProvider>,
    )

    const frame = app.ansi
    // #4C566A = rgb(76, 86, 106)
    const { r, g, b } = hexToRgb(defaultDarkTheme.border)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(frame)).toContain("inside")
  })

  test("Box with backgroundColor=$surface uses theme surface color", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box backgroundColor="$surface">
          <Text>content</Text>
        </Box>
      </ThemeProvider>,
    )

    const frame = app.ansi
    const { r, g, b } = hexToRgb(defaultDarkTheme.surface)
    expect(frame).toContain(`48;2;${r};${g};${b}`)
  })

  test("Box with literal borderColor passes through unchanged", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box borderStyle="single" borderColor="green">
          <Text>inside</Text>
        </Box>
      </ThemeProvider>,
    )

    const frame = app.ansi
    expect(stripAnsi(frame)).toContain("inside")
    // Should NOT contain theme border color
    const { r, g, b } = hexToRgb(defaultDarkTheme.border)
    expect(frame).not.toContain(`38;2;${r};${g};${b}`)
  })
})

// ============================================================================
// Theme switching
// ============================================================================

describe("theme switching", () => {
  test("switching theme changes resolved colors", async () => {
    function ThemeSwitcher() {
      const [dark, setDark] = useState(true)
      const theme = dark ? defaultDarkTheme : defaultLightTheme

      useInput((input: string) => {
        if (input === "t") setDark((d) => !d)
      })

      return (
        <ThemeProvider theme={theme}>
          <Text color="$primary">Hello</Text>
        </ThemeProvider>
      )
    }

    const app = render(<ThemeSwitcher />)

    // Initially dark theme: primary = #88C0D0 = rgb(136, 192, 208)
    const darkRgb = hexToRgb(defaultDarkTheme.primary)
    expect(app.ansi).toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)

    // Switch to light
    await app.press("t")

    // Light theme: primary = #5E81AC = rgb(94, 129, 172)
    const lightRgb = hexToRgb(defaultLightTheme.primary)
    expect(app.ansi).toContain(`38;2;${lightRgb.r};${lightRgb.g};${lightRgb.b}`)

    // Dark color should no longer be present
    expect(app.ansi).not.toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)
  })
})
