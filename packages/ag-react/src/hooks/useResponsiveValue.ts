/**
 * useResponsiveValue — pick a value based on the current viewport breakpoint.
 *
 * The Silvery analog of CSS `@media` queries / Polaris's responsive tokens.
 * Reactive on viewport-size changes (SIGWINCH in TUI; later ResizeObserver /
 * matchMedia in DOM/canvas targets).
 *
 * Named breakpoints (sm/md/lg) are mobile-first cumulative thresholds:
 *   - default: applies below `sm`
 *   - sm:      applies at `sm` and above (until md)
 *   - md:      applies at `md` and above (until lg)
 *   - lg:      applies at `lg` and above
 *
 * Defaults:
 *   sm = 60 cols (compact-but-functional terminal)
 *   md = 100 cols (comfortable + side panel)
 *   lg = 160 cols (wide / desktop terminal)
 *
 * Override defaults per-call by passing `breakpoints`:
 *   useResponsiveValue({ default: ..., md: ... }, { md: 120 })
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

/** Standard breakpoint names. Mobile-first cumulative. */
export type Breakpoint = "sm" | "md" | "lg"

/** Default breakpoint values in TUI columns. */
export const DEFAULT_BREAKPOINTS: Record<Breakpoint, number> = {
  sm: 60,
  md: 100,
  lg: 160,
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
export function useResponsiveValue<T>(values: ResponsiveValues<T>, options: UseResponsiveValueOptions = {}): T {
  const cols = useTerm((t) => t.size.cols())
  const bp = { ...DEFAULT_BREAKPOINTS, ...options.breakpoints }

  // Unknown size (mock term) → largest defined value.
  if (cols === 0) {
    return values.lg ?? values.md ?? values.sm ?? values.default
  }

  if (cols >= bp.lg && values.lg !== undefined) return values.lg
  if (cols >= bp.md && values.md !== undefined) return values.md
  if (cols >= bp.sm && values.sm !== undefined) return values.sm
  return values.default
}
