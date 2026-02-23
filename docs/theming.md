# Theming

inkx provides a lightweight theming system based on React context and semantic color tokens.

## Setup

Wrap your app in `ThemeProvider` with a theme object:

```tsx
import { ThemeProvider, defaultDarkTheme, Box, Text } from "inkx"

function App() {
  return (
    <ThemeProvider theme={defaultDarkTheme}>
      <Box borderColor="$border" borderStyle="single">
        <Text color="$primary">Hello</Text>
        <Text color="$muted">world</Text>
      </Box>
    </ThemeProvider>
  )
}
```

## $token Shorthand

Any color prop on `Box` or `Text` that starts with `$` is resolved against the active theme:

| Prop              | Components | Example                      |
| ----------------- | ---------- | ---------------------------- |
| `color`           | Box, Text  | `color="$primary"`           |
| `backgroundColor` | Box, Text  | `backgroundColor="$surface"` |
| `borderColor`     | Box        | `borderColor="$border"`      |
| `outlineColor`    | Box        | `outlineColor="$accent"`     |

Non-`$` values pass through unchanged (`color="red"`, `color="#ff0000"`).

## useTheme() Hook

Read the current theme from any component:

```tsx
import { useTheme } from "inkx"

function StatusLine() {
  const theme = useTheme()
  return <Text color={theme.dark ? "white" : "black"}>Status</Text>
}
```

Returns `defaultDarkTheme` when no `ThemeProvider` is present.

## Default Themes

Two Nord-inspired themes are included:

### Dark (default)

```
primary:    #88C0D0  (frost blue)
accent:     #B48EAD  (purple)
error:      #BF616A  (red)
warning:    #EBCB8B  (yellow)
success:    #A3BE8C  (green)
surface:    #3B4252  (polar night)
background: #2E3440  (darker)
text:       #ECEFF4  (snow)
muted:      #6C7A96  (muted)
border:     #4C566A  (border)
```

### Light

```
primary:    #5E81AC
accent:     #B48EAD
error:      #BF616A
warning:    #D08770
success:    #A3BE8C
surface:    #ECEFF4
background: #FFFFFF
text:       #2E3440
muted:      #7B88A1
border:     #D8DEE9
```

## Custom Themes

Create a theme by implementing the `Theme` interface:

```tsx
import { type Theme, ThemeProvider } from "inkx"

const solarized: Theme = {
  name: "solarized-dark",
  dark: true,
  primary: "#268BD2",
  accent: "#6C71C4",
  error: "#DC322F",
  warning: "#B58900",
  success: "#859900",
  surface: "#073642",
  background: "#002B36",
  text: "#839496",
  muted: "#586E75",
  border: "#073642",
}

<ThemeProvider theme={solarized}>
  <App />
</ThemeProvider>
```

## resolveThemeColor()

For advanced use cases, resolve tokens programmatically:

```tsx
import { resolveThemeColor, useTheme } from "inkx"

function CustomComponent({ highlight }: { highlight?: string }) {
  const theme = useTheme()
  const color = resolveThemeColor(highlight, theme) ?? theme.text
  // ...
}
```

## Token Reference

| Token         | Semantic Use                                     |
| ------------- | ------------------------------------------------ |
| `$primary`    | Links, active indicators, interactive highlights |
| `$accent`     | Tags, badges, decorative elements                |
| `$error`      | Validation errors, delete actions                |
| `$warning`    | Unsaved changes, deprecation notices             |
| `$success`    | Saved confirmation, passing tests                |
| `$surface`    | UI panel backgrounds (cards, sidebars, modals)   |
| `$background` | App background (outermost fill)                  |
| `$text`       | Primary text (body copy, headings)               |
| `$muted`      | Secondary text (placeholders, timestamps, hints) |
| `$border`     | Dividers, outlines, separators                   |
