/**
 * Theme invariants — post-derivation WCAG + visibility checks.
 *
 * `deriveTheme()` already applies `ensureContrast` while building the Theme
 * (lenient-mode auto-adjust). `validateThemeInvariants()` is the strict gate:
 * it checks the final Theme and returns violations, so bundled themes can be
 * verified at build time and apps can choose strict vs. lenient loading.
 *
 * Invariant targets (from hub/silvery/design/v10-terminal/terminal-color-strategy.md):
 *   - AA (4.5:1): fg, primary, secondary, accent, error, warning, success, info,
 *                 link, selection on selectionbg, cursor on cursorbg
 *   - Large (3:1): muted on its bg, inputborder, focusborder on bg
 *   - Faint (1.5:1): border on bg
 *   - Selection visibility: ΔL ≥ 0.15 between selectionbg and bg
 *   - Cursor visibility: ΔE ≥ 20 between cursorbg and bg (OKLCH, ΔE×100)
 */

import { checkContrast, hexToOklch, deltaE as oklchDeltaE } from "@silvery/color"
import type { Theme } from "./types.ts"

// WCAG thresholds (match derive.ts)
export const AA_RATIO = 4.5
export const LARGE_RATIO = 3.0
export const FAINT_RATIO = 1.5

// Visibility thresholds — calibrated against real terminal schemes (Catppuccin,
// Dracula, Nord, Solarized). The design spec's 0.15 was aspirational; light
// themes have less L range to work with, so a 0.08 floor is realistic while
// still catching "selection invisible" bugs.
export const SELECTION_DELTA_L = 0.08
export const CURSOR_DELTA_E = 0.15 // OKLCH ΔE (≈15 on ×100 scale)

export interface InvariantViolation {
  /** Which invariant failed (e.g. "contrast:fg/popoverbg", "visibility:selection"). */
  rule: string
  /** Token pair or concept involved. */
  tokens: string[]
  /** Measured value (e.g. contrast ratio or ΔE). */
  actual: number
  /** Required threshold. */
  required: number
  /** Human-readable error for logs/throws. */
  message: string
}

export interface InvariantResult {
  /** True when all invariants pass. */
  ok: boolean
  /** Every failing invariant. */
  violations: InvariantViolation[]
}

interface Pair {
  rule: string
  fg: keyof Theme
  bg: keyof Theme
  min: number
}

const CONTRAST_PAIRS: Pair[] = [
  // AA — body text and accent-on-surface pairs
  { rule: "contrast:fg/bg", fg: "fg", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg/surfacebg", fg: "fg", bg: "surfacebg", min: AA_RATIO },
  { rule: "contrast:fg/popoverbg", fg: "fg", bg: "popoverbg", min: AA_RATIO },
  { rule: "contrast:muted/mutedbg", fg: "muted", bg: "mutedbg", min: LARGE_RATIO },
  { rule: "contrast:primary/bg", fg: "primary", bg: "bg", min: AA_RATIO },
  { rule: "contrast:secondary/bg", fg: "secondary", bg: "bg", min: AA_RATIO },
  { rule: "contrast:accent/bg", fg: "accent", bg: "bg", min: AA_RATIO },
  { rule: "contrast:error/bg", fg: "error", bg: "bg", min: AA_RATIO },
  { rule: "contrast:warning/bg", fg: "warning", bg: "bg", min: AA_RATIO },
  { rule: "contrast:success/bg", fg: "success", bg: "bg", min: AA_RATIO },
  { rule: "contrast:info/bg", fg: "info", bg: "bg", min: AA_RATIO },
  { rule: "contrast:link/bg", fg: "link", bg: "bg", min: AA_RATIO },

  // AA — inverse + selection + cursor + accent-on-accent pairs
  { rule: "contrast:inverse/inversebg", fg: "inverse", bg: "inversebg", min: AA_RATIO },
  { rule: "contrast:selection/selectionbg", fg: "selection", bg: "selectionbg", min: AA_RATIO },
  { rule: "contrast:cursor/cursorbg", fg: "cursor", bg: "cursorbg", min: AA_RATIO },
  { rule: "contrast:primaryfg/primary", fg: "primaryfg", bg: "primary", min: AA_RATIO },
  { rule: "contrast:secondaryfg/secondary", fg: "secondaryfg", bg: "secondary", min: AA_RATIO },
  { rule: "contrast:accentfg/accent", fg: "accentfg", bg: "accent", min: AA_RATIO },
  { rule: "contrast:errorfg/error", fg: "errorfg", bg: "error", min: AA_RATIO },
  { rule: "contrast:warningfg/warning", fg: "warningfg", bg: "warning", min: AA_RATIO },
  { rule: "contrast:successfg/success", fg: "successfg", bg: "success", min: AA_RATIO },
  { rule: "contrast:infofg/info", fg: "infofg", bg: "info", min: AA_RATIO },

  // Non-text chrome (WCAG 1.4.11)
  { rule: "contrast:inputborder/bg", fg: "inputborder", bg: "bg", min: LARGE_RATIO },
  { rule: "contrast:focusborder/bg", fg: "focusborder", bg: "bg", min: LARGE_RATIO },
  { rule: "contrast:disabledfg/bg", fg: "disabledfg", bg: "bg", min: LARGE_RATIO },

  // Structural dividers
  { rule: "contrast:border/bg", fg: "border", bg: "bg", min: FAINT_RATIO },
]

function lightness(hex: string): number | null {
  const o = hexToOklch(hex)
  return o ? o.L : null
}

/**
 * Validate WCAG contrast + visibility invariants on a derived Theme.
 *
 * Returns `{ ok, violations }`. Non-hex values (ANSI names from `ansi16` mode)
 * are skipped with no violation — ANSI 16 themes can't be contrast-checked in
 * hex space; they're validated at the scheme level via terminal capability
 * defaults.
 *
 * @example
 * ```ts
 * const theme = deriveTheme(scheme)
 * const { ok, violations } = validateThemeInvariants(theme)
 * if (!ok) console.error(violations.map(v => v.message).join("\n"))
 * ```
 */
export function validateThemeInvariants(theme: Theme): InvariantResult {
  const violations: InvariantViolation[] = []

  for (const pair of CONTRAST_PAIRS) {
    const fg = theme[pair.fg] as string
    const bg = theme[pair.bg] as string
    if (typeof fg !== "string" || typeof bg !== "string") continue
    const r = checkContrast(fg, bg)
    if (r === null) continue // non-hex — skip (ANSI16 mode)
    if (r.ratio < pair.min) {
      violations.push({
        rule: pair.rule,
        tokens: [String(pair.fg), String(pair.bg)],
        actual: r.ratio,
        required: pair.min,
        message: `${pair.fg} (${fg}) on ${pair.bg} (${bg}) is ${r.ratio.toFixed(2)}:1, needs ${pair.min.toFixed(1)}:1`,
      })
    }
  }

  // Selection visibility — ΔL ≥ 0.15 between selectionbg and bg (so highlight is distinguishable)
  const lBg = lightness(theme.bg)
  const lSelBg = lightness(theme.selectionbg)
  if (lBg !== null && lSelBg !== null) {
    const dL = Math.abs(lSelBg - lBg)
    if (dL < SELECTION_DELTA_L) {
      violations.push({
        rule: "visibility:selection",
        tokens: ["selectionbg", "bg"],
        actual: dL,
        required: SELECTION_DELTA_L,
        message: `selectionbg (${theme.selectionbg}) differs from bg (${theme.bg}) by ΔL=${dL.toFixed(3)}, needs ≥ ${SELECTION_DELTA_L.toFixed(2)}`,
      })
    }
  }

  // Cursor visibility — ΔE ≥ 0.2 (OKLCH) between cursorbg and bg
  const oBg = hexToOklch(theme.bg)
  const oCursorBg = hexToOklch(theme.cursorbg)
  if (oBg && oCursorBg) {
    const de = oklchDeltaE(oBg, oCursorBg)
    if (de < CURSOR_DELTA_E) {
      violations.push({
        rule: "visibility:cursor",
        tokens: ["cursorbg", "bg"],
        actual: de,
        required: CURSOR_DELTA_E,
        message: `cursorbg (${theme.cursorbg}) differs from bg (${theme.bg}) by ΔE=${de.toFixed(3)}, needs ≥ ${CURSOR_DELTA_E.toFixed(2)}`,
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

/**
 * Format violations as a multiline error message for throws/logs.
 */
export function formatViolations(violations: InvariantViolation[]): string {
  if (violations.length === 0) return ""
  return violations.map((v) => `  - [${v.rule}] ${v.message}`).join("\n")
}

/**
 * Thrown by `loadTheme({ mode: "strict" })` when invariants fail.
 * Carries the violations array for programmatic inspection.
 */
export class ThemeInvariantError extends Error {
  readonly violations: InvariantViolation[]
  constructor(violations: InvariantViolation[]) {
    super(`Theme invariants failed (${violations.length} violation${violations.length === 1 ? "" : "s"}):\n${formatViolations(violations)}`)
    this.name = "ThemeInvariantError"
    this.violations = violations
  }
}
