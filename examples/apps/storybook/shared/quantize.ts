/**
 * Tier-quantization for storybook previews.
 *
 * The real pipeline quantizes colors at the output phase, when ANSI is
 * emitted to a TTY. The storybook renders its preview in-process via the
 * same runtime the host terminal uses — so if the host is truecolor-capable,
 * every tier looks identical because the output phase never has to
 * down-sample.
 *
 * To make the `1 / 2 / 3 / 4` toggle visibly different in the storybook, we
 * apply the same quantization at RENDER time to every hex value that flows
 * into the preview (legacy Theme tokens, Sterling Theme tokens, token-tree
 * swatch hexes, derivation-panel input chips). The result: switching to
 * `ansi16` snaps colors to one of 16 slots (very different look), `256`
 * introduces subtle cube-quantization shifts, `mono` collapses all hues to
 * black/white by luminance.
 *
 * This is a preview-only transform — it does not affect what a real terminal
 * would render at truecolor, because the output phase leaves truecolor hex
 * alone regardless.
 */

import { quantizeHex, type ColorTier } from "@silvery/ansi"
import type { Theme as LegacyTheme } from "@silvery/ansi"
import type { Theme as SterlingTheme } from "@silvery/theme"

const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/

function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value)
}

/**
 * Deep-quantize every hex-string leaf in an object. Non-hex strings, numbers,
 * booleans, and arrays of non-hex values pass through unchanged. Used for
 * both LegacyTheme and SterlingTheme — the structural rule "any leaf that
 * looks like a hex is a color value" holds for both.
 */
function quantizeObject<T>(obj: T, tier: ColorTier): T {
  if (obj == null) return obj
  if (isHex(obj)) return quantizeHex(obj, tier) as unknown as T
  if (Array.isArray(obj)) {
    return obj.map((v) => quantizeObject(v, tier)) as unknown as T
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = quantizeObject(v, tier)
    }
    return out as T
  }
  return obj
}

/** Quantize the legacy (silvery/ui) Theme. Returns a new object; inputs not mutated. */
export function quantizeLegacyTheme(theme: LegacyTheme, tier: ColorTier): LegacyTheme {
  if (tier === "truecolor") return theme
  return quantizeObject(theme, tier)
}

/** Quantize the Sterling Theme (nested roles + flat tokens). */
export function quantizeSterlingTheme(theme: SterlingTheme, tier: ColorTier): SterlingTheme {
  if (tier === "truecolor") return theme
  return quantizeObject(theme, tier)
}

export { quantizeHex }
export type { ColorTier }
