/**
 * Terminal palette auto-detection — Sterling-aware wrapper around
 * `@silvery/ansi`'s `detectTheme`.
 *
 * `@silvery/ansi`'s `detectTheme` returns a legacy `Theme` without Sterling
 * flat tokens (`border-default`, `fg-muted`, `bg-surface-default`, …). Tokens
 * like `"$border-default"` would resolve to `undefined` and fall through to
 * `parseColor → null`, which paints as the terminal's default foreground
 * (usually white-on-dark) — the canonical "borders look white" bug.
 *
 * This wrapper runs the detected / fallback theme through `inlineSterlingTokens`
 * so every shipped Theme is guaranteed to expose Sterling flat keys. This is
 * the canonical source of `detectTheme` for any consumer that uses Sterling
 * tokens (components, km-tui, silvery itself). The `@silvery/ansi` re-export
 * remains for callers that only touch the legacy Theme shape.
 *
 * To use Nord/Catppuccin as fallback palettes (richer than the built-in
 * defaults), pass them via options:
 *
 * @example
 * ```ts
 * import { detectTheme } from "@silvery/theme"
 * import { nord, catppuccinLatte } from "@silvery/theme/schemes"
 *
 * const theme = await detectTheme({ fallbackDark: nord, fallbackLight: catppuccinLatte })
 * ```
 */

import {
  detectTheme as _detectTheme,
  detectTerminalScheme,
  type DetectThemeOptions,
  type Theme,
} from "@silvery/ansi"
import { inlineSterlingTokens } from "./sterling/inline.ts"

export type { DetectedScheme, DetectThemeOptions } from "@silvery/ansi"
export { detectTerminalScheme }

/**
 * Detect the terminal's palette and return a Sterling-aware Theme.
 *
 * Identical to `@silvery/ansi`'s `detectTheme` but every returned theme has
 * Sterling flat tokens baked in via `inlineSterlingTokens`.
 */
export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const theme = await _detectTheme(opts)
  return inlineSterlingTokens(theme)
}
