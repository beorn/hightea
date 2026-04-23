/**
 * Extended underline style functions.
 *
 * Provides curly, dotted, dashed, and double underline styles with graceful
 * fallback to regular underline on unsupported terminals.
 *
 * Post km-silvery.unicode-plateau Phase 5 (2026-04-23): capability gating is
 * **required** via an explicit `caps: UnderlineCaps` argument. The earlier
 * optional-caps-with-ambient-`createTerminalProfile()`-fallback was an
 * ambient-authority leak — the helpers secretly read `process.env` when
 * callers omitted caps. Per /pro review: "Silvery is a UI framework, not
 * a string-formatting library. Callers should thread TerminalCaps from
 * their Term (`term.caps`) or profile; the safe cross-platform fallback
 * is to gracefully degrade (emit standard underline), not to implicitly
 * probe the environment."
 *
 * Consumer pattern inside React components:
 *   const caps = useTerm(t => t.caps)
 *   return <Text>{curlyUnderline(value, caps)}</Text>
 *
 * Consumer pattern outside React (scripts, tests):
 *   const { caps } = createTerminalProfile()
 *   console.log(curlyUnderline(value, caps))
 */

import {
  UNDERLINE_CODES,
  UNDERLINE_COLOR_RESET,
  UNDERLINE_STANDARD,
  UNDERLINE_RESET_STANDARD,
  buildUnderlineColorCode,
} from "./constants"
import type { TerminalCaps } from "./detection"
import type { UnderlineStyle, RGB } from "./types"

// Standard underline ANSI codes (replaces chalk.underline)
const UNDERLINE_OPEN = "\x1b[4m"
const UNDERLINE_CLOSE = "\x1b[24m"

/**
 * Structural subset of {@link TerminalCaps} the underline helpers actually
 * look at. Declared as its own type so callers can synthesize test fixtures
 * without pulling in the full caps surface.
 */
export type UnderlineCaps = Pick<TerminalCaps, "underlineStyles" | "underlineColor">

// =============================================================================
// Extended Underline Functions
// =============================================================================

/**
 * Apply an extended underline style to text.
 * Falls back to standard underline on terminals without
 * `caps.underlineStyles`.
 *
 * @param text - Text to underline
 * @param style - Underline style (default: "single")
 * @param caps - Terminal capabilities (`term.caps` or `createTerminalProfile().caps`)
 * @returns Styled text with ANSI codes
 */
export function underline(
  text: string,
  style: UnderlineStyle,
  caps: UnderlineCaps,
): string {
  if (!caps.underlineStyles || style === "single") {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  return `${UNDERLINE_CODES[style]}${text}${UNDERLINE_CODES.reset}`
}

/**
 * Apply curly/wavy underline to text.
 * Commonly used for spell check errors in IDEs.
 * Falls back to standard underline when `caps.underlineStyles` is false.
 *
 * @param text - Text to underline
 * @param caps - Terminal capabilities (`term.caps` or `createTerminalProfile().caps`)
 * @returns Styled text with curly underline
 *
 * @example
 * ```ts
 * import { curlyUnderline, createTerminalProfile } from '@silvery/ansi'
 *
 * const { caps } = createTerminalProfile()
 * console.log(curlyUnderline('misspelled', caps))
 * ```
 */
export function curlyUnderline(text: string, caps: UnderlineCaps): string {
  return underline(text, "curly", caps)
}

/**
 * Apply dotted underline to text.
 * Falls back to standard underline when `caps.underlineStyles` is false.
 */
export function dottedUnderline(text: string, caps: UnderlineCaps): string {
  return underline(text, "dotted", caps)
}

/**
 * Apply dashed underline to text.
 * Falls back to standard underline when `caps.underlineStyles` is false.
 */
export function dashedUnderline(text: string, caps: UnderlineCaps): string {
  return underline(text, "dashed", caps)
}

/**
 * Apply double underline to text.
 * Falls back to standard underline when `caps.underlineStyles` is false.
 */
export function doubleUnderline(text: string, caps: UnderlineCaps): string {
  return underline(text, "double", caps)
}

// =============================================================================
// Underline Color Functions
// =============================================================================

/**
 * Set underline color independently of text color.
 * On terminals without `caps.underlineColor`, the color is ignored but
 * standard underline still applies.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param text - Text to style
 * @param caps - Terminal capabilities
 * @returns Styled text with colored underline
 */
export function underlineColor(
  r: number,
  g: number,
  b: number,
  text: string,
  caps: UnderlineCaps,
): string {
  if (!caps.underlineColor) {
    // Fallback: standard underline, ignore color
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${UNDERLINE_STANDARD}${colorCode}${text}${UNDERLINE_COLOR_RESET}${UNDERLINE_RESET_STANDARD}`
}

/**
 * Combine underline style with underline color.
 *
 * On terminals where `caps.underlineStyles` is false, degrades to standard
 * underline (color dropped). When `caps.underlineStyles` is true but
 * `caps.underlineColor` is false (rare — usually paired), emits the style
 * without color.
 *
 * @param style - Underline style ('curly', 'dotted', 'dashed', 'double', 'single')
 * @param rgb - Color as [r, g, b] tuple (0-255 each)
 * @param text - Text to style
 * @param caps - Terminal capabilities
 * @returns Styled text with colored underline in specified style
 */
export function styledUnderline(
  style: UnderlineStyle,
  rgb: RGB,
  text: string,
  caps: UnderlineCaps,
): string {
  if (!caps.underlineStyles) {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  const [r, g, b] = rgb
  const styleCode = UNDERLINE_CODES[style]

  if (!caps.underlineColor) {
    // Terminal gates style but not color (rare — usually paired in caps).
    // Emit style-only.
    return `${styleCode}${text}${UNDERLINE_CODES.reset}`
  }

  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`
}
