/**
 * ThemeContext — delivers a Theme to the component tree.
 *
 * Wrap your app (or a subtree) in `<ThemeProvider theme={…}>` to make
 * `$token` color props resolve against that theme. Components call
 * `useTheme()` to read the current theme.
 *
 * @example
 * ```tsx
 * import { ThemeProvider, defaultDarkTheme } from '@silvery/ag-react'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */

import { createContext, useContext } from "react"
import type { Theme } from "@silvery/ansi"
import { defaultDarkTheme } from "./schemes/index"

// ============================================================================
// Context
// ============================================================================

/** @internal Exported for @silvery/ag-react ThemeProvider — not public API. */
export const ThemeContext = createContext<Theme>(defaultDarkTheme)

// ============================================================================
// Hook
// ============================================================================

/**
 * Read the current theme from context.
 *
 * Returns `defaultDarkTheme` when no `ThemeProvider` is present.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext)
}
