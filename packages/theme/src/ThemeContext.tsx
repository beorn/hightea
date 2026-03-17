/**
 * ThemeContext — delivers a Theme to the component tree.
 *
 * Wrap your app (or a subtree) in `<ThemeProvider theme={…}>` to make
 * `$token` color props resolve against that theme. Components call
 * `useTheme()` to read the current theme.
 *
 * @example
 * ```tsx
 * import { ThemeProvider, defaultDarkTheme } from '@silvery/react'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */

import React, { createContext, useContext } from "react"
import type { Theme } from "./types"
import { setActiveTheme } from "./state"
import { defaultDarkTheme } from "./palettes/index"

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<Theme>(defaultDarkTheme)

// ============================================================================
// Provider
// ============================================================================

export interface ThemeProviderProps {
  theme: Theme
  children: React.ReactNode
  /**
   * When true (default), wraps children in a container that sets
   * `color="$fg"` so all text inherits the theme's foreground color.
   * This is essential when the theme differs from the terminal
   * (e.g., previewing a light theme in a dark terminal).
   *
   * Set to false for test environments or nested ThemeProviders
   * where a wrapper element would interfere with layout assertions.
   */
  root?: boolean
}

/**
 * Provide a theme to the subtree.
 *
 * Components beneath this provider can use `useTheme()` or `$token`
 * color props (e.g. `color="$primary"`).
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps): React.ReactElement {
  // Set module-level active theme so parseColor() can resolve $token strings
  // during the content phase without needing React context access.
  setActiveTheme(theme)
  return React.createElement(ThemeContext.Provider, { value: theme }, children)
}

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
