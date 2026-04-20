/**
 * Backdrop fade — color math helpers.
 *
 * Two operations, one per channel (see `./plan.ts` docstring for the full
 * perceptual rationale):
 *
 *   fg' = deemphasizeOklch(fg, amount)   // OKLCH: L*=(1-α), C*=(1-α)², H preserved
 *   bg' = mixSrgb(bg, scrim, amount)     // sRGB source-over alpha
 *
 * `@silvery/color` exports `mixSrgb` and `deemphasize` for third-party
 * consumers; these inline copies exist only to keep silvery self-contained
 * across publish cycles (silvery's build references `@silvery/color` as an
 * external at install time, so adding a new export in the same release
 * cycle breaks CI verify — the published dist doesn't ship the new name
 * until its next publish).
 *
 * `colorToHex` is the buffer-cell adapter: it resolves a `Color` (RGB
 * triple | ANSI 256 index | `DEFAULT_BG` sentinel | null) to a `#rrggbb`
 * hex string, or null if unresolvable.
 */

import { hexToOklch, oklchToHex } from "@silvery/color"
import { ansi256ToRgb, isDefaultBg, type Color } from "../../buffer"

/** Convert a buffer Color to a `#rrggbb` hex string, or null if unresolvable. */
export function colorToHex(color: Color): string | null {
  if (color === null) return null
  if (typeof color === "number") {
    const rgb = ansi256ToRgb(color)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  if (isDefaultBg(color)) return null
  return rgbToHex(color.r, color.g, color.b)
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => {
    const v = Math.max(0, Math.min(255, Math.round(n)))
    return v.toString(16).padStart(2, "0")
  }
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null
  let s = hex
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) {
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  }
  if (s.length !== 6) return null
  const r = parseInt(s.slice(0, 2), 16)
  const g = parseInt(s.slice(2, 4), 16)
  const b = parseInt(s.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

/**
 * sRGB source-over alpha mix. Inlined locally to avoid a publish-cycle
 * dependency on `@silvery/color`'s `mixSrgb` export — silvery's build
 * references `@silvery/color` as an external at install time, so adding a
 * new export in the same release cycle breaks CI verify (the published
 * `@silvery/color` dist doesn't ship the new name until its next publish).
 * `@silvery/color` does re-export `mixSrgb` from its source for third-party
 * consumers; this inline copy exists only to keep silvery self-contained.
 */
export function mixSrgb(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return a
  const u = Math.max(0, Math.min(1, t))
  const r = ra.r * (1 - u) + rb.r * u
  const g = ra.g * (1 - u) + rb.g * u
  const bl = ra.b * (1 - u) + rb.b * u
  return rgbToHex(r, g, bl)
}

/**
 * OKLCH-native deemphasize: linear L reduction, QUADRATIC C reduction,
 * hue preserved.
 *
 *   L' = L × (1 - amount)
 *   C' = C × (1 - amount)²
 *   H' = H
 *
 * The asymmetric chroma falloff corrects for a perceptual nonlinearity:
 * the human visual system reads chroma RELATIVE to luminance, so a modest
 * OKLCH C at low L *appears* distinctly more chromatic than the same C at
 * high L. Proportional L+C scaling (`C *= 1-α`, preserving C/L) therefore
 * feels "darker but more saturated" to viewers — the exact complaint that
 * prompted this revision.
 *
 * Using `(1-α)²` for chroma reduces saturation faster than lightness:
 *
 *   α=0.25 → L *= 0.75, C *= 0.563  (C/L drops to 75% of original)
 *   α=0.40 → L *= 0.60, C *= 0.360  (C/L drops to 60%)
 *   α=0.50 → L *= 0.50, C *= 0.250  (C/L drops to 50%)
 *   α=1.00 → both 0 (fully faded to pure black).
 *
 * At the default ModalDialog amount (0.25), pale-lavender `#cdd6f4`
 * deemphasizes to L=0.66, C=0.024 — visibly muted, not "even more
 * saturated than before".
 *
 * `@silvery/color` exports `deemphasize` for third-party consumers; this
 * inline copy exists only to keep silvery self-contained across publish
 * cycles (see the `mixSrgb` inline comment for rationale).
 */
export function deemphasizeOklch(hex: string, amount: number): string {
  const o = hexToOklch(hex)
  if (!o) return hex
  const a = Math.max(0, Math.min(1, amount))
  const chromaFactor = (1 - a) * (1 - a)
  return oklchToHex({
    L: Math.max(0, o.L * (1 - a)),
    C: Math.max(0, o.C * chromaFactor),
    H: o.H,
  })
}
