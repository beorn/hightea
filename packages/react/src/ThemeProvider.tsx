/**
 * ThemeProvider — delivers a Theme to the component tree.
 *
 * Renders as a Box, so it accepts all Box props (backgroundColor, flexDirection,
 * etc.). Sets both React context (useTheme()) and Box `theme` prop (pipeline
 * $token resolution via pushContextTheme/popContextTheme).
 *
 * Does NOT call setActiveTheme() — that's only done by run()/render() for the
 * root theme. Nested ThemeProviders use the Box `theme` prop which is properly
 * scoped via the content phase's push/pop stack.
 *
 * @example
 * ```tsx
 * // Root app — no layout props needed
 * <ThemeProvider theme={detectedTheme}>
 *   <App />
 * </ThemeProvider>
 *
 * // Themed panel — layout props on ThemeProvider itself
 * <ThemeProvider theme={lightTheme} backgroundColor="$bg" borderStyle="single">
 *   <Text>Uses light theme colors</Text>
 * </ThemeProvider>
 * ```
 */

import React from "react"
import { ThemeContext } from "@silvery/theme/ThemeContext"
import { Box } from "./components/Box"
import type { BoxProps } from "./components/Box"
import type { Theme } from "@silvery/theme/types"

export interface ThemeProviderProps extends Omit<BoxProps, "theme"> {
  /** The theme to provide to the subtree. */
  theme: Theme
}

export function ThemeProvider({ theme, children, ...boxProps }: ThemeProviderProps): React.ReactElement {
  return (
    <ThemeContext.Provider value={theme}>
      <Box theme={theme} {...boxProps}>
        {children}
      </Box>
    </ThemeContext.Provider>
  )
}
