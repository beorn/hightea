---
title: "Migrating from Ink to Silvery: A Practical Guide"
description: "Step-by-step migration guide with real code examples showing the compatibility layer and native API adoption."
date: 2026-04-02
---

# Migrating from Ink to Silvery: A Practical Guide

I've migrated several Ink applications to Silvery. The process is surprisingly painless -- Silvery passes 804 out of 813 of Ink's own test suite, so most code works with a two-line import swap. But there's a difference between "it works" and "it takes advantage of what Silvery offers." This guide covers both.

## Phase 1: The Two-Line Swap

The fastest path from Ink to Silvery is the compatibility layer. Change your imports:

```diff
- import { Box, Text, render, useInput, useApp } from "ink"
+ import { Box, Text, render, useInput, useApp } from "silvery/ink"

- import chalk from "chalk"
+ import chalk from "silvery/chalk"
```

That's it. Run your tests. You should see 98.9% of Ink's behavior preserved, and you get Silvery's incremental rendering engine for free -- interactive updates will be about 100x faster without changing any component code.

Install Silvery and remove Ink:

```bash
bun add silvery
bun remove ink ink-testing-library
```

### What the Compat Layer Does

`silvery/ink` is a thin adapter (~50 lines) that bridges Ink's API surface to Silvery's native systems. `render()` returns the same shape as Ink's render. `useInput()` has the same callback signature. `Box` and `Text` accept the same props.

Under the hood, everything runs through Silvery's five-phase pipeline: layout, React render, content generation, buffer compositing, and output diffing. Your components don't know the difference.

### The 9 Edge Cases

If you hit issues, they're likely one of these:

- **flexDirection default**: Silvery defaults to `row` (CSS spec), Ink defaults to `column`. The compat layer preserves Ink's `column` default, so this shouldn't bite you. If you're importing from `silvery` directly instead of `silvery/ink`, add `flexDirection="column"` where needed.
- **Text wrapping**: Silvery wraps text by default. Ink lets it overflow. If you depend on overflow behavior, add `wrap={false}`.
- **Flex wrap edge cases**: Flexily follows the W3C spec where Yoga diverges in 2 flex-wrap scenarios and 2 aspect-ratio scenarios. These are rare in practice.

## Phase 2: Native Imports

Once your app runs on the compat layer, switch to native Silvery imports. The API is almost identical -- mostly it's cleaner naming:

```diff
- import { Box, Text, render, useInput, useApp } from "silvery/ink"
+ import { Box, Text, useInput, useApp } from "silvery"
+ import { run } from "silvery/runtime"
```

The main difference is how you start the app:

```tsx
// Ink style
const { unmount, waitUntilExit } = render(<App />)
await waitUntilExit()

// Silvery style
await run(<App />)

// Or with explicit terminal control
import { render, createTerm } from "silvery"
using term = createTerm()
await render(<App />, term).run()
```

`run()` is a convenience that creates a term, renders, and runs the event loop. The explicit `createTerm()` pattern gives you control over terminal configuration and uses TC39 Explicit Resource Management (`using`) for automatic cleanup.

## Phase 3: Adopt Silvery Features

This is where the real value shows up. Each of these is an incremental change -- you don't need to do them all at once.

### Replace Prop Drilling with useContentRect()

This is the single biggest improvement. If you're threading `width` props through your component tree:

```tsx
// Before: Ink-style prop drilling
function Card({ width }: { width: number }) {
  return (
    <Box width={width}>
      <Text>{truncate(title, width - 4)}</Text>
    </Box>
  )
}

function Column({ width }: { width: number }) {
  return (
    <Box flexDirection="column" width={width}>
      {cards.map((c) => (
        <Card key={c.id} width={width - 2} />
      ))}
    </Box>
  )
}

function Board() {
  const termWidth = process.stdout.columns
  const colWidth = Math.floor(termWidth / 3)
  return (
    <Box flexDirection="row">
      {columns.map((col) => (
        <Column key={col.id} width={colWidth} />
      ))}
    </Box>
  )
}
```

Replace with:

```tsx
// After: Silvery responsive components
function Card() {
  const { width } = useContentRect()
  return (
    <Box>
      <Text>{truncate(title, width - 4)}</Text>
    </Box>
  )
}

function Column() {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {cards.map((c) => (
        <Card key={c.id} />
      ))}
    </Box>
  )
}

function Board() {
  return (
    <Box flexDirection="row">
      {columns.map((col) => (
        <Column key={col.id} />
      ))}
    </Box>
  )
}
```

No width props. No arithmetic. Components know their own size. If the terminal resizes, everything adapts automatically.

### Replace Manual Key Handlers with SelectList

If you have a `useInput` handler tracking cursor position:

```tsx
// Before: manual cursor management
const [cursor, setCursor] = useState(0)
useInput((input, key) => {
  if (key.downArrow || input === "j") setCursor((c) => Math.min(c + 1, items.length - 1))
  if (key.upArrow || input === "k") setCursor((c) => Math.max(c - 1, 0))
  if (key.return) onSelect(items[cursor])
})

return (
  <Box flexDirection="column">
    {items.map((item, i) => (
      <Text key={i} inverse={i === cursor}>
        {item.label}
      </Text>
    ))}
  </Box>
)
```

Replace with:

```tsx
// After: SelectList handles everything
<SelectList items={items} onSelect={onSelect} maxVisible={10} />
```

`SelectList` handles j/k, arrow keys, Home/End, Page Up/Down, mouse clicks, scroll indicators, disabled items, and theming. It's one line instead of twenty.

### Replace Manual Scrolling with overflow="scroll"

If you're manually virtualizing a list:

```tsx
// Before: manual scroll offset
const [offset, setOffset] = useState(0)
const visible = items.slice(offset, offset + maxVisible)
```

Replace with:

```tsx
// After: native scrolling
<Box overflow="scroll" height={maxVisible} scrollTo={selectedIdx}>
  {items.map((item) => (
    <ItemRow key={item.id} item={item} />
  ))}
</Box>
```

Silvery measures the children, determines which are visible, and renders only those. Variable-height items work automatically.

### Replace Chalk with Semantic Theme Tokens

If you're using chalk for colors:

```tsx
// Before: hardcoded colors
import chalk from "chalk"
<Text>{chalk.cyan(title)}</Text>
<Text>{chalk.gray(subtitle)}</Text>
<Text>{chalk.red("Error: " + message)}</Text>
```

Replace with semantic tokens:

```tsx
// After: theme-aware colors
<Text color="$primary">{title}</Text>
<Text color="$muted">{subtitle}</Text>
<Text color="$error">{"Error: " + message}</Text>
```

`$primary`, `$muted`, `$error` -- these resolve against the active theme. Your app works on dark terminals, light terminals, and custom themes without any conditional logic.

Even better, most components already use the right colors by default. A `<Badge variant="error">` uses `$error` automatically. A `<Divider />` is already dimmed. If you find yourself typing `color="$fg"`, you're spelling out the default -- just remove it.

### Replace ink-text-input with TextInput

Ink doesn't ship a text input -- you need the third-party `ink-text-input`. Silvery's `TextInput` is built in with full readline support:

```tsx
// Before: third-party package
import TextInput from "ink-text-input"
;<TextInput value={query} onChange={setQuery} onSubmit={handleSubmit} />

// After: built-in with readline, cursor movement, kill ring
import { TextInput } from "silvery"
;<TextInput value={query} onChange={setQuery} onSubmit={handleSubmit} placeholder="Search..." />
```

You get Ctrl+A/E (start/end of line), Ctrl+K/U (kill to end/start), Alt+B/F (word movement), Ctrl+Y (yank), and more -- the same readline shortcuts most developers have in muscle memory.

## Common Gotchas

**Testing**: Replace `ink-testing-library` with `@silvery/test`. The `render()` function from `@silvery/test` returns stripped-text output for assertions. For full ANSI testing (verifying colors, cursor position, box drawing), use `createTermless()` -- it runs a real terminal emulator in-process.

**flexDirection**: If you're importing from `silvery` (not `silvery/ink`), remember that Box defaults to `flexDirection="row"`. This matches the CSS spec but differs from Ink. The root node and `<Screen>` still default to `column`.

**render() is sync**: Silvery's `render()` returns a handle synchronously. Call `.run()` to start the event loop. This is a deliberate design choice -- you get a chance to configure the handle before the app starts.

**The first render**: If you use `useContentRect()`, the first render pass sees `{ width: 0, height: 0 }`. The second render pass has real values. Both happen before the first paint, so this is usually invisible. Add a `if (width === 0) return null` guard if it causes issues.

## Is It Worth It?

For a simple CLI tool that renders once and exits, the compat layer is probably enough. Swap imports, ship it.

For interactive applications, adopting native Silvery features is worth the effort. `useContentRect()` alone eliminates an entire category of layout bugs. `SelectList` and `TextInput` replace hundreds of lines of manual input handling. Semantic theming makes your app work everywhere without conditional color logic.

The migration doesn't have to be all-or-nothing. Start with the compat layer, then adopt native features one component at a time. Each step is a self-contained improvement.
