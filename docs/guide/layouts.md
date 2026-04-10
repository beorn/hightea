# Building Complex Layouts

Silvery's layout is powered by [Flexily](https://beorn.codes/flexily), a pure JavaScript flexbox engine. This guide walks through building a typical TUI application layout with:

- Responsive components that know their own size
- Fixed-height top/bottom bars
- Flexible content area that fills remaining space
- Multiple scrollable columns
- Visual scroll indicators

## The Goal

A board-style layout like this:

```
┌──────────────────────────────────────────────────┐
│ Top Bar (fixed height)                           │
├──────────────────────────────────────────────────┤
│ ‹ │ Column 1      │ Column 2      │ Column 3 │ › │
│   │ Card 1        │ Card A        │ Card X   │   │
│   │ Card 2        │ Card B        │ Card Y   │   │
│   │ Card 3        │ ...           │ ...      │   │
├──────────────────────────────────────────────────┤
│ Bottom Bar (fixed height)                        │
└──────────────────────────────────────────────────┘
```

## Step 1: Fixed Bars with Flexible Content

Use `flexShrink={0}` for fixed elements and `flexGrow={1}` for flexible areas:

```tsx
function App() {
  return (
    <Box flexDirection="column" height="100%">
      {/* Top bar - fixed height, won't shrink */}
      <Box height={1} flexShrink={0} backgroundColor="blue">
        <Text color="white" bold>
          {" "}
          My App{" "}
        </Text>
      </Box>

      {/* Content area - fills remaining space */}
      <Box flexGrow={1} flexDirection="row">
        {/* Your columns go here */}
      </Box>

      {/* Bottom bar - fixed height, won't shrink */}
      <Box height={1} flexShrink={0}>
        <Text dimColor>Press q to quit</Text>
      </Box>
    </Box>
  )
}
```

**Key points:**

- `flexShrink={0}` prevents bars from shrinking when space is tight
- `flexGrow={1}` makes the content area fill all remaining vertical space
- No height calculation needed - flexbox handles it automatically

## Step 2: Multiple Columns

For equal-width columns, give each the same `flexGrow`:

```tsx
<Box flexGrow={1} flexDirection="row">
  <Box flexGrow={1} flexDirection="column">
    <Text bold>Column 1</Text>
    {/* cards */}
  </Box>
  <Box flexGrow={1} flexDirection="column">
    <Text bold>Column 2</Text>
    {/* cards */}
  </Box>
  <Box flexGrow={1} flexDirection="column">
    <Text bold>Column 3</Text>
    {/* cards */}
  </Box>
</Box>
```

## Step 3: Scrollable Content

Use `overflow="scroll"` with `scrollTo` to automatically scroll to a selected item:

```tsx
function Column({ items, selectedIndex }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Fixed header */}
      <Box height={1} flexShrink={0}>
        <Text bold>Column Title</Text>
      </Box>

      {/* Scrollable content - fills remaining height */}
      <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={selectedIndex}>
        {items.map((item, i) => (
          <Text key={i} inverse={i === selectedIndex}>
            {item.title}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
```

**Key points:**

- `overflow="scroll"` enables virtual scrolling
- `scrollTo={selectedIndex}` keeps the selected item visible
- `flexGrow={1}` makes the scrollable area fill available space
- No height prop needed - Silvery calculates it from the flexbox layout

## Step 4: Scroll Indicators with Filled Backgrounds

For scroll indicators that fill available height with a background color:

```tsx
function ScrollIndicator({ direction }: { direction: "left" | "right" }) {
  const arrow = direction === "left" ? "‹" : "›"

  return (
    <Box width={1} flexGrow={1} backgroundColor="gray" justifyContent="center" alignItems="center">
      <Text color="white">{arrow}</Text>
    </Box>
  )
}
```

**Key points:**

- `flexGrow={1}` fills available vertical space
- `backgroundColor="gray"` fills the entire computed area (Silvery feature)
- `justifyContent="center"` centers the arrow vertically
- No height calculation or Array.from() loops needed

## Step 5: Column Separators

For visual separators between columns:

```tsx
function ColumnSeparator() {
  return (
    <Box width={1} flexGrow={1} flexDirection="column">
      {/* Blank line to align with column headers */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>
      {/* Line fills remaining space */}
      <Box flexGrow={1}>
        <Text color="gray">│</Text>
      </Box>
    </Box>
  )
}
```

## Complete Example

Putting it all together:

```tsx
import { render, Box, Text, useInput, useApp, createTerm } from "silvery"
import { useState } from "react"

function ScrollIndicator({ direction }) {
  return (
    <Box width={1} flexGrow={1} backgroundColor="gray" justifyContent="center" alignItems="center">
      <Text color="white">{direction === "left" ? "‹" : "›"}</Text>
    </Box>
  )
}

function Column({ title, items, selectedIndex, isActive }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box height={1} flexShrink={0} backgroundColor={isActive ? "cyan" : undefined}>
        <Text bold color={isActive ? "black" : undefined}>
          {title} ({items.length})
        </Text>
      </Box>

      {/* Scrollable items */}
      <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={selectedIndex}>
        {items.map((item, i) => (
          <Text key={i} inverse={isActive && i === selectedIndex}>
            {item}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

function Board() {
  const { exit } = useApp()
  const [colIndex, setColIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)

  const columns = [
    {
      title: "To Do",
      items: ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5"],
    },
    { title: "Doing", items: ["Task A", "Task B"] },
    { title: "Done", items: ["Task X", "Task Y", "Task Z"] },
  ]

  // Show scroll indicators if there are more columns than visible
  const showLeftIndicator = colIndex > 0
  const showRightIndicator = colIndex < columns.length - 1

  useInput((input, key) => {
    if (input === "q") exit()
    if (key.leftArrow) setColIndex((i) => Math.max(0, i - 1))
    if (key.rightArrow) setColIndex((i) => Math.min(columns.length - 1, i + 1))
    if (key.upArrow) setCardIndex((i) => Math.max(0, i - 1))
    if (key.downArrow) {
      const maxIndex = columns[colIndex].items.length - 1
      setCardIndex((i) => Math.min(maxIndex, i + 1))
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      {/* Top bar */}
      <Box height={1} flexShrink={0} backgroundColor="blue" paddingX={1}>
        <Text color="white" bold>
          My Kanban Board
        </Text>
      </Box>

      {/* Content area */}
      <Box flexGrow={1} flexDirection="row">
        {showLeftIndicator && <ScrollIndicator direction="left" />}

        {columns.map((col, i) => (
          <Column
            key={col.title}
            title={col.title}
            items={col.items}
            selectedIndex={i === colIndex ? cardIndex : -1}
            isActive={i === colIndex}
          />
        ))}

        {showRightIndicator && <ScrollIndicator direction="right" />}
      </Box>

      {/* Bottom bar */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text dimColor>←→ switch column ↑↓ select q quit</Text>
      </Box>
    </Box>
  )
}

using term = createTerm()
await render(<Board />, term)
```

## Anti-Patterns to Avoid

### ❌ Don't calculate heights manually

```tsx
// Bad: manual height calculation
const contentHeight = terminalRows - topBarHeight - bottomBarHeight
<Box height={contentHeight}>...</Box>
```

### ✅ Do use flexbox

```tsx
// Good: let flexbox handle it
<Box flexGrow={1}>...</Box>
```

### ❌ Don't create arrays for filled backgrounds

```tsx
// Bad: creating array of rows for background
<Box width={1} height={height}>
  {Array.from({ length: height }).map((_, i) => (
    <Text key={i} backgroundColor="gray">
      {" "}
    </Text>
  ))}
</Box>
```

### ✅ Do use Box backgroundColor

```tsx
// Good: Box fills its area automatically
<Box width={1} flexGrow={1} backgroundColor="gray">
  <Text color="white">›</Text>
</Box>
```

## Responsive Layout with useBoxRect()

The killer feature for complex layouts: components can query their own dimensions during render. This is like [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries) — components adapt to their container, not the viewport.

```tsx
function ResponsiveBoard({ items }) {
  const { width } = useBoxRect()
  // Adapt column count to available space
  const columns = width > 120 ? 4 : width > 80 ? 3 : width > 40 ? 2 : 1

  return (
    <Box>
      {Array.from({ length: columns }, (_, i) => (
        <Box key={i} flexGrow={1} flexDirection="column">
          {items
            .filter((_, j) => j % columns === i)
            .map((item) => (
              <Card key={item.id} item={item} />
            ))}
        </Box>
      ))}
    </Box>
  )
}
```

No prop drilling, no `measureElement` + `useEffect` dance. The layout engine computes dimensions first, then components render with correct values. This works at any nesting depth — a `Card` inside a `Column` inside a `Board` all get their own dimensions simultaneously, in one batch.

```tsx
function Card({ item }) {
  const { width } = useBoxRect()
  return (
    <Box borderStyle="round" flexDirection="column">
      <Text bold>{width > 30 ? item.title : truncate(item.title, width - 4)}</Text>
      {width > 50 && <Text color="$muted">{item.description}</Text>}
    </Box>
  )
}
```

::: tip First render returns zeros
`useBoxRect()` returns `{ width: 0, height: 0 }` on the first render (before layout runs). Guard with `if (width === 0) return null` if your component can't render without dimensions. The framework handles the re-render automatically.
:::

## Summary

| Need                 | Solution                                          |
| -------------------- | ------------------------------------------------- |
| Fixed-height element | `height={n}` + `flexShrink={0}`                   |
| Fill remaining space | `flexGrow={1}`                                    |
| Scrollable list      | `overflow="scroll"` + `scrollTo={index}`          |
| Responsive columns   | `useBoxRect()` + conditional rendering            |
| Adaptive content     | `useBoxRect()` + truncation / hide at breakpoints |
| Filled background    | `backgroundColor="color"` on Box                  |
| Centered content     | `justifyContent="center"` + `alignItems="center"` |

## Text Layout {#text-layout}

CSS gives you `fit-content` (widest wrapped line) and greedy word-wrap. There's no way to say _"find the narrowest width that still produces exactly 3 lines"_ or _"break lines to minimize raggedness across the whole paragraph."_

Silvery adds these capabilities, inspired by [Pretext](https://chenglou.me/pretext/).

### Width Sizing

`width` controls how a Box sizes itself:

| Value | What it does |
|---|---|
| `width={60}` | Fixed at 60 columns |
| `width="fit-content"` | Shrink to widest wrapped line (CSS `fit-content`) |
| `width="snug-content"` | Tightest width that keeps the same line count |

#### `fit-content` vs `snug-content`

`fit-content` wraps text, then sizes the box to the widest line. When the last line is short, the box has dead space:

```
┌──────────────────┐
│ Hello world, this │  ← widest line sets the width
│ is a test         │  ← wasted space ──────────→
└──────────────────┘
```

`snug-content` finds the _narrowest_ width that still produces the same number of lines — what [Pretext calls "shrinkwrap"](https://chenglou.me/pretext/bubbles/). It binary-searches over widths, comparing line counts, without any DOM or layout reflows:

```
┌───────────────┐
│ Hello world,  │  ← tighter: same 2 lines
│ this is a test│  ← no dead space
└───────────────┘
```

```tsx
<Box width="snug-content" borderStyle="round">
  <Text>The quick brown fox jumps over the lazy dog</Text>
</Box>
```

Best for: chat bubbles, tooltips, badges, cards with final content.

::: warning
`snug-content` can cause width jitter on live-editing text — when text crosses a wrap boundary, the box width can suddenly shrink. Use `fit-content` for dynamic text; `snug-content` for static content.
:::

### Wrap Modes

`wrap` controls how text breaks when it exceeds the container width:

| Mode | What it does |
|---|---|
| `wrap="wrap"` | Word-aware wrapping — each line as full as possible (default) |
| `wrap="balanced"` | Equalize line widths — less ragged right edge |
| `wrap="optimal"` | Minimize total raggedness — [Knuth-Plass style](https://en.wikipedia.org/wiki/Line_wrap_and_word_wrap#Minimum_raggedness) paragraph layout |
| `wrap="hard"` | Character-level wrapping — break anywhere |
| `wrap={false}` | Truncate with ellipsis |
| `wrap="clip"` | Hard cut at width, no ellipsis |
| `wrap="truncate-start"` | Ellipsis at start: `…end of text` |
| `wrap="truncate-middle"` | Ellipsis in middle: `start…end` |

#### Greedy vs Balanced vs Optimal

**Greedy** (`wrap="wrap"`) fills each line as much as possible, left to right. Simple and predictable:

```
The quick brown fox jumps over the
lazy dog sat on the mat.
```

**Balanced** (`wrap="balanced"`) reduces raggedness by equalizing line widths:

```
The quick brown fox jumps
over the lazy dog sat on the mat.
```

**Optimal** (`wrap="optimal"`) minimizes the _total_ wasted space across all lines using dynamic programming. This is what professional typesetting software uses ([Knuth-Plass paragraph layout](https://en.wikipedia.org/wiki/Line_wrap_and_word_wrap#Minimum_raggedness)):

```tsx
<Box width={60}>
  <Text wrap="optimal">
    Long paragraph that benefits from globally-optimal line breaks
    rather than greedy per-line decisions.
  </Text>
</Box>
```

All three modes have the same rendering performance (~25 microseconds for typical terminal text). The analysis is cached per text node — repeated renders at the same width are free.

### Width × Wrap Interaction

Width and wrap are orthogonal — they compose naturally:

```tsx
{/* Tightest bubble, balanced lines — prettiest for chat */}
<Box width="snug-content" borderStyle="round" padding={1}>
  <Text wrap="balanced">Hello world, this is a message</Text>
</Box>

{/* Fixed width, optimal paragraph breaking */}
<Box width={60}>
  <Text wrap="optimal">{longParagraph}</Text>
</Box>

{/* Fit-content with balanced — normal box, even lines */}
<Box width="fit-content">
  <Text wrap="balanced">{description}</Text>
</Box>
```

`snug-content` without a wrap mode defaults to greedy wrapping. Truncation modes (`wrap={false}`, `wrap="clip"`) produce single lines, so `snug-content` has no effect with them — use `fit-content` instead.
