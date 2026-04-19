/**
 * Active theme state — module-level fallback for pipeline access.
 *
 * This module has side effects (global mutable state).
 * Marked in package.json sideEffects for tree-shaking.
 *
 * NOTE: `setActiveTheme()` is now a no-op. Theme flows through the AgNode tree
 * via `<Box theme={}>` props (set by ThemeProvider in @silvery/ag-react), using
 * the same pushContextTheme/popContextTheme mechanism as the existing `theme`
 * prop cascade in render-phase.ts. `getActiveTheme()` remains as a safe fallback
 * for code paths that render without a ThemeProvider (e.g. bare tests, xterm
 * renderer before ThemeProvider wraps the element).
 *
 * Usage of standalone resolveThemeColor(token, theme) is preferred for callers
 * that have a Theme reference available.
 */

import type { Theme } from "@silvery/ansi"
import { ansi16DarkTheme } from "./schemes/index"

// ============================================================================
// Active Theme (fallback only — not set by ThemeProvider)
// ============================================================================

/**
 * Safe fallback theme. Never mutated — the theme flows via the AgNode tree
 * (Box theme= prop + pushContextTheme/popContextTheme in render-phase.ts).
 * This is only returned by getActiveTheme() when called from a code path that
 * has no pushContextTheme frame on the stack, e.g. a bare test that renders
 * without ThemeProvider.
 */
const _activeTheme: Theme = ansi16DarkTheme

/**
 * @deprecated No-op. Theme now flows via the AgNode tree (Box theme= prop +
 * pushContextTheme/popContextTheme in render-phase.ts). Calls to setActiveTheme
 * have no effect. Remove call sites; use ThemeProvider from @silvery/ag-react.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setActiveTheme(_theme: Theme): void {
  // intentional no-op — theme flows via AgNode tree, not module state
}

/** Get the active theme (fallback to ansi16DarkTheme when no context stack entry exists). */
export function getActiveTheme(): Theme {
  return _contextStack.length > 0 ? _contextStack[_contextStack.length - 1]! : _activeTheme
}

// ============================================================================
// Active Color Level (tier dispatch)
// ============================================================================

/**
 * Color tier the render pipeline is targeting.
 *
 * Mirrors `TerminalCaps.colorLevel` but lives in module state for the
 * render-helpers parseColor() / getTextStyle() functions, which don't have
 * access to the OutputContext or React props. Set by the runtime
 * (`createPipeline()` in `@silvery/ag-term/measurer.ts`) before the first
 * render, and updated on cap changes.
 *
 * At `"none"` (monochrome), `parseColor("$primary")` returns `null` and
 * `getTextStyle()` injects mono-attrs (bold, dim, italic, underline, inverse,
 * strikethrough) from `DEFAULT_MONO_ATTRS`. See `hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4`.
 */
export type ActiveColorLevel = "none" | "basic" | "256" | "truecolor"

let _activeColorLevel: ActiveColorLevel = "truecolor"

/** Set the active color level (called by the runtime based on TerminalCaps). */
export function setActiveColorLevel(level: ActiveColorLevel): void {
  _activeColorLevel = level
}

/** Get the active color level (called by parseColor / getTextStyle in render-helpers). */
export function getActiveColorLevel(): ActiveColorLevel {
  return _activeColorLevel
}

// ============================================================================
// Context Theme Stack (per-subtree overrides during render phase)
// ============================================================================

/**
 * Stack of per-subtree theme overrides, pushed/popped during render phase
 * tree walk. When a Box has a `theme` prop, its theme is pushed before
 * rendering children and popped after. getActiveTheme() checks this stack
 * first, falling back to _activeTheme.
 *
 * This enables CSS custom property-like cascading: the nearest ancestor
 * Box with a theme prop determines $token resolution for its subtree.
 * ThemeProvider (in @silvery/ag-react) renders a <Box theme={merged}>
 * wrapper, so its theme is naturally pushed via this mechanism.
 */
const _contextStack: Theme[] = []

/** Push a context theme (called by render phase for Box nodes with theme prop). */
export function pushContextTheme(theme: Theme): void {
  _contextStack.push(theme)
}

/** Pop a context theme (called by render phase after processing Box subtree). */
export function popContextTheme(): void {
  _contextStack.pop()
}
