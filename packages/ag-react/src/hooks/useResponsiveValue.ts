/**
 * useResponsiveValue — pick a value based on the current viewport breakpoint.
 *
 * The Silvery analog of CSS `@media` queries / Polaris's responsive tokens.
 * Reactive on viewport-size changes (SIGWINCH in TUI; later ResizeObserver /
 * matchMedia in DOM/canvas targets).
 *
 * Named breakpoints follow Bootstrap / Tailwind / Polaris conventions —
 * mobile-first cumulative thresholds:
 *   - default: applies below `xs`
 *   - xs:      applies at `xs` and above (until sm)
 *   - sm:      applies at `sm` and above (until md)
 *   - md:      applies at `md` and above (until lg)
 *   - lg:      applies at `lg` and above (until xl)
 *   - xl:      applies at `xl` and above
 *
 * Defaults (terminal columns):
 *   xs = 30  — very narrow (split pane, phone-like)
 *   sm = 60  — compact terminal
 *   md = 90  — code-width (~80 char + breathing room)
 *   lg = 120 — code + sidebar comfortably
 *   xl = 150 — desktop / wide terminal
 *
 * Override defaults per-call by passing `breakpoints`:
 *   useResponsiveValue({ default: ..., md: ... }, { md: 100 })
 *
 * @example
 * ```tsx
 * const panelMode = useResponsiveValue<"overlay" | "inline">({
 *   default: "overlay",
 *   sm: "inline",
 * })
 * ```
 *
 * Future targets: when Silvery ships DOM/canvas, this hook keeps the same
 * surface — only the size source changes (matchMedia/container queries instead
 * of `term.size.cols()`).
 */

import { useTerm } from "./useTerm"

/** Standard breakpoint names. Mobile-first cumulative — Bootstrap/Tailwind/Polaris convention. */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl"

/** Default breakpoint values in TUI columns. */
export const DEFAULT_BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 30,
  sm: 60,
  md: 90,
  lg: 120,
  xl: 150,
}

export type ResponsiveValues<T> = { default: T } & Partial<Record<Breakpoint, T>>

export interface UseResponsiveValueOptions {
  /** Override default breakpoint thresholds. Merges with DEFAULT_BREAKPOINTS. */
  breakpoints?: Partial<Record<Breakpoint, number>>
}

/**
 * Resolve a responsive value against the current viewport size.
 *
 * Treats `cols === 0` as "unknown — return the largest defined value".
 * Test harnesses with mock terms typically report 0; this yields the
 * full-width default which matches existing visual fixtures.
 */
export function useResponsiveValue<T>(
  values: ResponsiveValues<T>,
  options: UseResponsiveValueOptions = {},
): T {
  const cols = useTerm((t) => t.size.cols())
  const bp = { ...DEFAULT_BREAKPOINTS, ...options.breakpoints }

  // Unknown size (mock term) → largest defined value.
  if (cols === 0) {
    return values.xl ?? values.lg ?? values.md ?? values.sm ?? values.xs ?? values.default
  }

  if (cols >= bp.xl && values.xl !== undefined) return values.xl
  if (cols >= bp.lg && values.lg !== undefined) return values.lg
  if (cols >= bp.md && values.md !== undefined) return values.md
  if (cols >= bp.sm && values.sm !== undefined) return values.sm
  if (cols >= bp.xs && values.xs !== undefined) return values.xs
  return values.default
}
