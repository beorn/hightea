/**
 * deriveFields — single helper that fills all derived theme sections.
 *
 * Eliminates 4-way duplication of brand, categorical ring, state-variant, and
 * variants population across:
 *   - derive.ts   (deriveTruecolorTheme + deriveAnsi16Theme)
 *   - default-schemes.ts (ansi16DarkTheme + ansi16LightTheme)
 *   - @silvery/theme/generate.ts   (generateTheme)
 *   - @silvery/theme/schemes/index.ts (ansi16DarkTheme + ansi16LightTheme)
 *
 * Canonical authority: derive.ts truecolor path. ANSI16 paths are aligned to
 * deriveAnsi16Theme output (which is itself the canonical ANSI16 reference).
 */

import { brighten, darken } from "@silvery/color"
import type { Theme, Variant } from "./types.ts"

// =============================================================================
// Shared DEFAULT_VARIANTS constant — single source of truth.
// All 4 sites reference this exact object (or a structurally identical copy).
// =============================================================================

/** Default typography variants — token-based, works across any theme. */
export const DEFAULT_VARIANTS: Record<string, Variant> = {
  h1: { color: "$primary", bold: true },
  h2: { color: "$accent", bold: true },
  h3: { bold: true },
  body: {},
  "body-muted": { color: "$muted" },
  "fine-print": { color: "$muted", dim: true },
  strong: { bold: true },
  em: { italic: true },
  link: { color: "$link", underlineStyle: "single" },
  key: { color: "$accent", bold: true },
  code: { backgroundColor: "$mutedbg" },
  kbd: { backgroundColor: "$mutedbg", color: "$accent", bold: true },
}

// =============================================================================
// Input types
// =============================================================================

/** Inputs for ANSI16 mode — ANSI color name strings (no hex math possible). */
export interface DeriveFieldsAnsi16Input {
  mode: "ansi16"
  /** The primary color (e.g. "yellow", "blue"). */
  primary: string
  /** The accent color (e.g. "blueBright", "cyan"). */
  accent: string
  /** The foreground color (e.g. "whiteBright", "black"). */
  fg: string
  /** The selectionbg color — used for bgSelectedHover. */
  selectionbg: string
  /** The surfacebg color — used for bgSurfaceHover. */
  surfacebg: string
  /**
   * Pre-computed categorical ring colors. In ANSI16 mode these are named
   * slots; no blending is possible.
   *
   * All 8 ring fields are required for ANSI16. Pass them explicitly from the
   * calling site (whether static or schema-derived).
   */
  ring: {
    red: string
    orange: string
    yellow: string
    green: string
    teal: string
    blue: string
    purple: string
    pink: string
  }
}

/** Inputs for truecolor mode — hex strings + OKLCH shift direction. */
export interface DeriveFieldsTruecolorInput {
  mode: "truecolor"
  /** Whether the theme is dark (controls shift direction). */
  dark: boolean
  /** The primary color (hex). */
  primary: string
  /** The accent color (hex). */
  accent: string
  /** The foreground color (hex). */
  fg: string
  /** The selectionbg color (hex) — used for bgSelectedHover. */
  selectionbg: string
  /** The surfacebg color (hex) — used for bgSurfaceHover. */
  surfacebg: string
  /**
   * Pre-computed categorical ring colors (hex). The caller is responsible for
   * applying ensureContrast before passing these.
   */
  ring: {
    red: string
    orange: string
    yellow: string
    green: string
    teal: string
    blue: string
    purple: string
    pink: string
  }
}

export type DeriveFieldsInput = DeriveFieldsAnsi16Input | DeriveFieldsTruecolorInput

// =============================================================================
// Output type
// =============================================================================

export interface DerivedFields {
  // Brand
  brand: string
  brandHover: string
  brandActive: string

  // Categorical ring (canonical names)
  red: string
  orange: string
  yellow: string
  green: string
  teal: string
  blue: string
  purple: string
  pink: string

  // Deprecated brand-<hue> aliases (same values; for backward compat one release)
  brandRed: string
  brandOrange: string
  brandYellow: string
  brandGreen: string
  brandTeal: string
  brandBlue: string
  brandPurple: string
  brandPink: string

  // State variants
  primaryHover: string
  primaryActive: string
  accentHover: string
  accentActive: string
  fgHover: string
  fgActive: string
  bgSelectedHover: string
  bgSurfaceHover: string

  // Typography variants
  variants: Theme["variants"]
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Derive the shared "delta" fields common to every theme object:
 * brand tokens, categorical ring, state variants, and typography variants.
 *
 * Truecolor mode: hover = ±0.04L, active = ±0.08L (brighten on dark, darken on light).
 * ANSI16 mode: no lightness shifts possible — hover/active fall back to base color.
 */
export function deriveFields(input: DeriveFieldsInput): DerivedFields {
  if (input.mode === "ansi16") {
    return deriveFieldsAnsi16(input)
  }
  return deriveFieldsTruecolor(input)
}

function deriveFieldsAnsi16(input: DeriveFieldsAnsi16Input): DerivedFields {
  const { primary, accent, fg, selectionbg, surfacebg, ring } = input

  return {
    // Brand — maps to primary; no shifts in ANSI16
    brand: primary,
    brandHover: primary,
    brandActive: primary,

    // Categorical ring
    ...ring,

    // Deprecated aliases (mirror canonical ring)
    brandRed: ring.red,
    brandOrange: ring.orange,
    brandYellow: ring.yellow,
    brandGreen: ring.green,
    brandTeal: ring.teal,
    brandBlue: ring.blue,
    brandPurple: ring.purple,
    brandPink: ring.pink,

    // State variants — no OKLCH shifts in ANSI16; fall back to base color
    primaryHover: primary,
    primaryActive: primary,
    accentHover: accent,
    accentActive: accent,
    fgHover: fg,
    fgActive: fg,
    bgSelectedHover: selectionbg,
    bgSurfaceHover: surfacebg,

    variants: DEFAULT_VARIANTS,
  }
}

function deriveFieldsTruecolor(input: DeriveFieldsTruecolorInput): DerivedFields {
  const { dark, primary, accent, fg, selectionbg, surfacebg, ring } = input

  // Shift helper — brightens on dark themes, darkens on light themes
  const shift = (hex: string, amount: number): string =>
    dark ? brighten(hex, amount) : darken(hex, amount)

  return {
    // Brand — maps to primary; hover/active shift OKLCH L ±0.04 / ±0.08
    brand: primary,
    brandHover: shift(primary, 0.04),
    brandActive: shift(primary, 0.08),

    // Categorical ring
    ...ring,

    // Deprecated aliases (mirror canonical ring)
    brandRed: ring.red,
    brandOrange: ring.orange,
    brandYellow: ring.yellow,
    brandGreen: ring.green,
    brandTeal: ring.teal,
    brandBlue: ring.blue,
    brandPurple: ring.purple,
    brandPink: ring.pink,

    // State variants — OKLCH lightness shift ±0.04 / ±0.08
    primaryHover: shift(primary, 0.04),
    primaryActive: shift(primary, 0.08),
    accentHover: shift(accent, 0.04),
    accentActive: shift(accent, 0.08),
    fgHover: shift(fg, 0.04),
    fgActive: shift(fg, 0.08),
    bgSelectedHover: shift(selectionbg, 0.04),
    bgSurfaceHover: shift(surfacebg, 0.04),

    variants: DEFAULT_VARIANTS,
  }
}
