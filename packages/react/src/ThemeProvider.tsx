/**
 * ThemeProvider — delivers a Theme to the component tree.
 *
 * Re-exports the base ThemeProvider from @silvery/theme with an optional
 * `root` mode that wraps children in a `<Box color="$fg">` for automatic
 * foreground inheritance.
 *
 * ## Usage
 *
 * Most apps don't need `root` — the terminal's default fg matches the
 * detected theme. Use `root` when previewing a theme that differs from
 * the terminal (e.g., light theme in a dark terminal):
 *
 * ```tsx
 * // Normal app — detected theme matches terminal, no root needed
 * <ThemeProvider theme={detectedTheme}>
 *   <App />
 * </ThemeProvider>
 *
 * // Theme preview — theme differs from terminal, use root
 * <ThemeProvider theme={previewTheme} root>
 *   <Box backgroundColor="$bg">...</Box>
 * </ThemeProvider>
 * ```
 */

import React from "react"
import { ThemeProvider as BaseThemeProvider } from "@silvery/theme/ThemeContext"
import type { ThemeProviderProps } from "@silvery/theme/ThemeContext"
import { Box } from "./components/Box"

export function ThemeProvider({ theme, children, root = false }: ThemeProviderProps): React.ReactElement {
  if (!root) {
    return <BaseThemeProvider theme={theme}>{children}</BaseThemeProvider>
  }
  return (
    <BaseThemeProvider theme={theme}>
      <Box color="$fg" flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </BaseThemeProvider>
  )
}
