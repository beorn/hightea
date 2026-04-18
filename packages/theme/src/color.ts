/**
 * Color manipulation utilities.
 *
 * Re-exports from @silvery/color — the canonical OKLCH-native implementation.
 * This module exists to preserve @silvery/theme's public API.
 */

export {
  hexToRgb,
  rgbToHex,
  blend,
  brighten,
  darken,
  saturate,
  contrastFg,
  relativeLuminance,
  rgbToHsl,
  hslToHex,
  hexToHsl,
  desaturate,
  complement,
  hexToOklch,
  oklchToHex,
  oklch,
  toHex,
  lerpOklch,
  lerpOklabHex,
  deltaE,
  colorDistance,
} from "@silvery/color"
export type { HSL, OKLCH } from "@silvery/color"
