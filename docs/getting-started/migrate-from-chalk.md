# Migrate from Chalk

## You Don't Have to Migrate

Silvery includes a full Chalk compatibility layer. Just swap the import:

```diff
- import chalk from 'chalk'
+ import chalk from 'silvery/chalk'
```

That's it. All your chalk-styled strings work unchanged — `chalk.red.bold("Error!")` produces the same output. You get silvery's theme-aware color detection for free.

When you're ready for silvery's native styling (semantic tokens, theme palettes, auto-dark/light), follow the steps below.

## Quick Start

### Step 1: Install Silvery

::: code-group

```bash [bun]
bun add silvery
```

```bash [npm]
npm install silvery
```

```bash [pnpm]
pnpm add silvery
```

```bash [yarn]
yarn add silvery
```

:::

### Step 2: Update Imports

```diff
- import chalk from 'chalk'
+ import chalk from 'silvery/chalk'
```

The `silvery/chalk` module provides a Chalk-compatible API. Your existing chalk-styled strings work unchanged inside Silvery's `<Text>` component:

```tsx
import chalk from "silvery/chalk"
import { Text } from "silvery"

// Chalk-style strings work inside Text
<Text>{chalk.red.bold("Error!")}</Text>

// Or use Text's built-in style props directly
<Text color="red" bold>Error!</Text>
```

## API Compatibility

| Chalk Feature     | silvery/chalk | Notes                        |
| ----------------- | ------------- | ---------------------------- |
| `chalk.red()`     | Supported     | All standard colors          |
| `chalk.bold()`    | Supported     | All modifiers                |
| `chalk.rgb()`     | Supported     | 24-bit color                 |
| `chalk.hex()`     | Supported     | Hex color codes              |
| `chalk.bgRed()`   | Supported     | Background colors            |
| Chaining          | Supported     | `chalk.red.bold.underline()` |
| Template literals | Supported     | `` chalk`{red text}` ``      |

## Why Switch?

- **Zero dependencies** -- Silvery's chalk compat is built-in, no extra package needed
- **ANSI-aware compositing** -- Pre-styled text composes correctly with layout and styles (see below)
- **Consistent theming** -- Use `$token` colors from `@silvery/theme` alongside chalk-style strings
- **Tree-shakeable** -- Only the styles you use end up in your bundle

## ANSI-Aware Compositing

Most terminal frameworks pass ANSI escape sequences through as opaque strings. This breaks when styled text meets layout — clipping mid-sequence corrupts terminal state, backgrounds don't cascade through styled text, and incremental rendering can't diff styled regions.

Silvery parses all ANSI sequences (from chalk, kleur, picocolors, or raw escapes) into structured cell properties, then reconstructs optimal output during rendering. This means pre-styled text participates fully in layout, composition, and diffing:

```tsx
import chalk from "silvery/chalk"

// Chalk styles compose with Silvery's component styles
<Box backgroundColor="blue">
  <Text bold>{chalk.red("error")} and {chalk.yellow("warning")}</Text>
</Box>
// Result: "error" is red+bold on blue, "warning" is yellow+bold on blue
// The blue background cascades through chalk-styled text automatically

// Styles merge at the cell level — no leaked resets, no conflicts
<Text color="cyan" underline>
  {chalk.bold("bold+cyan+underline")} just cyan+underline
</Text>
```

With raw passthrough (Ink, blessed), the same code produces broken output — chalk's reset sequences (`\x1b[39m`) clear the parent's background, clipping truncates mid-escape-sequence, and unchanged styled text gets re-emitted every frame.

See [Smart ANSI Layering](/guide/ansi-layering) for the full architecture.

## Using Theme Colors Instead

For new code, consider using Silvery's semantic theme tokens instead of hardcoded colors:

```tsx
import { Text, ThemeProvider } from "silvery"
import { presetTheme } from "@silvery/theme"

// Instead of chalk.red("Error")
<Text color="$error">Error!</Text>

// Instead of chalk.dim("secondary text")
<Text color="$muted">Secondary text</Text>
```

Theme tokens adapt to the active palette -- your app looks correct in any theme without changing color values.

## See Also

- [Theming Guide](/guides/theming) -- Full theme system documentation
- [Components Guide](/guides/components) -- Text component styling props
- [Ink/Chalk Compatibility Reference](/reference/compatibility) -- Complete API mapping tables
