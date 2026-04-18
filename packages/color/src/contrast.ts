/**
 * WCAG 2.1 contrast checking and enforcement.
 *
 * - checkContrast(): measure the ratio between two colors (WCAG 2.1)
 * - ensureContrast(): adjust a color until it meets a target ratio
 *
 * `ensureContrast` operates in OKLCH — it preserves hue and chroma while
 * walking lightness toward the contrast target. This avoids the hue-shift
 * artifacts HSL-based contrast repair can introduce.
 */

import { hexToOklch, oklchToHex } from "./oklch.ts"
import { contrastFg, relativeLuminance } from "./color.ts"
import type { ContrastResult } from "./types.ts"

/**
 * Check contrast ratio between foreground and background colors.
 *
 * Uses the WCAG 2.1 relative luminance formula to compute the contrast
 * ratio and check AA (>= 4.5:1) and AAA (>= 7:1) compliance for normal text.
 *
 * @param fg - Foreground hex color (e.g. "#FFFFFF")
 * @param bg - Background hex color (e.g. "#000000")
 * @returns Contrast ratio and AA/AAA pass/fail, or null if colors are not valid hex
 *
 * @example
 * ```typescript
 * const result = checkContrast("#FFFFFF", "#000000")
 * // { ratio: 21, aa: true, aaa: true }
 *
 * const poor = checkContrast("#777777", "#888888")
 * // { ratio: ~1.3, aa: false, aaa: false }
 * ```
 */
export function checkContrast(fg: string, bg: string): ContrastResult | null {
  const fgLum = relativeLuminance(fg)
  const bgLum = relativeLuminance(bg)
  if (fgLum === null || bgLum === null) return null

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)
  const ratio = (lighter + 0.05) / (darker + 0.05)

  return {
    ratio, // exact — callers round for display if needed
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
  }
}

/**
 * Adjust a color's OKLCH lightness until it meets a minimum WCAG contrast ratio
 * against a reference color. Preserves hue and chroma — only lightness shifts,
 * and only as much as needed.
 *
 * Returns the original color unchanged if it already meets the target.
 *
 * For impossible targets (e.g. 21:1 against mid-gray), returns the
 * best achievable color (near-black or near-white in the same hue).
 *
 * @param color - The color to adjust (hex)
 * @param against - The reference background color (hex)
 * @param minRatio - Minimum contrast ratio to achieve (e.g. 4.5 for AA)
 * @returns Adjusted hex color meeting the target, or original if already OK
 *
 * @example
 * ```typescript
 * // Yellow on white — too low contrast, gets darkened (perceptually; same hue preserved)
 * ensureContrast("#FFAB91", "#FFFFFF", 4.5)
 *
 * // Blue on dark bg — already fine, returned unchanged
 * ensureContrast("#5C9FFF", "#1A1A2E", 4.5)  // → "#5C9FFF"
 * ```
 */
export function ensureContrast(color: string, against: string, minRatio: number): string {
  const current = checkContrast(color, against)
  if (!current) return color // non-hex input — return unchanged
  if (current.ratio >= minRatio) return color

  const o = hexToOklch(color)
  if (!o) return color

  // Light bg → darken (decrease L), dark bg → lighten (increase L)
  const lightBg = contrastFg(against) === "#000000"

  // Binary search the minimum L shift (in OKLCH) that achieves the target.
  let lo: number, hi: number
  if (lightBg) {
    lo = 0 // maximum darkening
    hi = o.L // current lightness
  } else {
    lo = o.L // current lightness
    hi = 1 // maximum lightening
  }

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const candidate = oklchToHex({ L: mid, C: o.C, H: o.H })
    const r = checkContrast(candidate, against)
    if (!r) break
    if (lightBg) {
      // Lower L = more contrast. Find highest L that still passes.
      if (r.ratio >= minRatio) lo = mid
      else hi = mid
    } else {
      // Higher L = more contrast. Find lowest L that still passes.
      if (r.ratio >= minRatio) hi = mid
      else lo = mid
    }
  }

  return oklchToHex({ L: lightBg ? lo : hi, C: o.C, H: o.H })
}
