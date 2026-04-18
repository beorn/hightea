/**
 * Build the StorybookEntry list from @silvery/theme builtin palettes.
 *
 * For each scheme we pre-derive both a truecolor and an ansi16 Theme so the
 * tier toggle has zero-latency switching.
 */

import { builtinPalettes, deriveTheme, type ThemeAdjustment } from "@silvery/theme"
import type { StorybookEntry } from "./types"

export function buildEntries(): StorybookEntry[] {
  return Object.entries(builtinPalettes).map(([name, palette]) => {
    const adjustments: ThemeAdjustment[] = []
    const theme = deriveTheme(palette, "truecolor", adjustments)
    const themeAnsi16 = deriveTheme(palette, "ansi16")
    return {
      name,
      palette,
      theme,
      themeAnsi16,
      adjustments,
      dark: palette.dark !== false,
    }
  })
}
