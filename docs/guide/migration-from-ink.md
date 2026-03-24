# From Ink to Silvery

## You Don't Have to Migrate

Silvery includes a full Ink compatibility layer. Just swap the import path:

```diff
- import { Box, Text, render } from "ink"
+ import { Box, Text, render } from "silvery/ink"
```

That's it. Your existing Ink app runs on Silvery's renderer — getting incremental rendering, layout feedback, and all the performance improvements for free. No other code changes needed.

When you're ready for the full Silvery API (and we recommend it eventually — the API is cleaner and more powerful), follow the migration steps below. For a feature-by-feature comparison, see [Silvery vs Ink](/guide/silvery-vs-ink).

## Step 1: Swap Dependencies

```bash
bun remove ink ink-testing-library
bun add silvery
```

One package is all you need. Optionally add `@silvery/test` for testing.

If you use Yoga-specific layout behavior:

```bash
bun add yoga-wasm-web  # optional: exact Ink layout parity
```

## Step 2: Update Imports

Most imports are a direct find-and-replace:

| Ink                                            | Silvery                                  |
| ---------------------------------------------- | ---------------------------------------- |
| `import { Box, Text } from 'ink'`              | `import { Box, Text } from 'silvery'`    |
| `import { render } from 'ink'`                 | `import { render } from 'silvery'`       |
| `import { useInput } from 'ink'`               | `import { useInput } from 'silvery'`     |
| `import { useApp } from 'ink'`                 | `import { useApp } from 'silvery'`       |
| `import { useStdout } from 'ink'`              | `import { useStdout } from 'silvery'`    |
| `import { Static } from 'ink'`                 | `import { Static } from 'silvery'`       |
| `import { Newline } from 'ink'`                | `import { Newline } from 'silvery'`      |
| `import { Spacer } from 'ink'`                 | `import { Spacer } from 'silvery'`       |
| `import { render } from 'ink-testing-library'` | `import { render } from '@silvery/test'` |

Everything from `ink` maps to `silvery`. The API surface is the same.

## Step 3: Update `render()` Call

Silvery's `render()` is sync (like Ink) but the app's event loop is started with `.run()`:

```diff
- const { unmount, waitUntilExit } = render(<App />)
+ const app = render(<App />)
+ await app.run()  // starts the event loop, resolves on exit
```

Without a `term` argument, Silvery auto-detects TTY and wires up stdin/stdout -- matching Ink's behavior. No `createTerm()` needed for most apps.

For explicit terminal control (optional):

```tsx
import { render, createTerm } from "silvery"

using term = createTerm()
const app = render(<App />, term)
await app.run()
```

The `using` keyword (TC39 Explicit Resource Management) automatically restores the terminal on scope exit -- cursor visibility, raw mode, alternate screen. No manual cleanup needed.

## Step 4: Run Your Tests

```bash
bun test
```

Most apps work at this point. The sections below cover the differences you may need to address.

## Key Behavioral Differences

### flexDirection Defaults to `row`

Ink defaults to `flexDirection="column"` (non-standard). Silvery follows the W3C CSS spec and defaults to `row`.

```tsx
// Ink: children stack vertically
<Box>
  <Text>A</Text>
  <Text>B</Text>
</Box>
// Output:
// A
// B

// Silvery: children flow horizontally
<Box>
  <Text>A</Text>
  <Text>B</Text>
</Box>
// Output: AB
```

**Fix:** Add `flexDirection="column"` to any `<Box>` that relied on the vertical default. The root element and `<Screen>` already default to `column`, so top-level layouts usually work without changes.

If you prefer exact Ink layout parity, use Yoga as the layout engine:

```tsx
await render(<App />, { layoutEngine: "yoga" })
// or set SILVERY_ENGINE=yoga
```

### Layout-Aware Rendering

This is the feature that motivated Silvery's existence. Components can query their own dimensions during render via `useContentRect()`:

```tsx
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}
```

No equivalent exists in Ink -- Ink's `useBoxMetrics()` returns `0x0` on first render and updates via `useEffect`. This means you can remove width prop drilling from your codebase after migrating.

### Text Wraps by Default

Ink lets text overflow its container. Silvery wraps text to fit, with ANSI-aware word boundaries.

```tsx
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Ink: "This is a very long text" (overflows)
// Silvery: wraps to "This is a" / "very long" / "text"
```

**Fix:** Add `wrap={false}` if you rely on overflow behavior.

### Resource Cleanup with `using`

Ink uses manual `unmount()`. Silvery supports both `unmount()` and the `using` keyword for automatic cleanup:

```tsx
// Ink pattern (still works)
const app = render(<App />)
app.unmount()

// Silvery pattern (preferred)
{
  using app = render(<App />)
  await app.run()
  // app is automatically cleaned up when scope exits
}
```

### Scrollable Containers

Ink supports `overflow: "visible" | "hidden"`. Silvery adds `overflow: "scroll"`:

```tsx
// Replace manual virtualization with:
<Box overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item) => (
    <Item key={item.id} item={item} />
  ))}
</Box>
```

## What Works the Same

These all transfer directly -- no changes needed:

- **React hooks**: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, etc.
- **JSX**: Same component model, same children, same keys
- **Flexbox layout**: `padding`, `margin`, `gap`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `justifyContent`
- **Borders**: `borderStyle="single"`, `"double"`, `"round"`, `"bold"`, etc.
- **Chalk styling**: All chalk styles work unchanged in `<Text>`
- **`useInput` signature**: `(input: string, key: Key) => void`
- **`useApp().exit()`**: Same exit pattern

## Common Gotchas

### 1. First Render Returns Zero Dimensions

Components using `useContentRect()` render twice -- first with `{width: 0, height: 0}`, then with actual values. Both renders happen before the first paint, so it's usually invisible. Guard if needed:

```tsx
const { width } = useContentRect()
if (width === 0) return null
```

### 2. Third-Party Ink Components

Packages like `ink-text-input`, `ink-select-input`, `ink-spinner` import from `ink`. You have two options:

1. **Use Silvery equivalents**: `TextInput`, `SelectList`, `Spinner` are built into `silvery/ui`
2. **Alias imports**: Configure your bundler to alias `ink` to `silvery`

### 3. `measureElement()` → `useContentRect()`

Ink's `measureElement(ref)` requires a ref, runs after render, and returns stale dimensions until a `useEffect` fires. Silvery's `useContentRect()` is fundamentally different:

```tsx
// Ink: ref + effect, dimensions arrive late
function Card() {
  const ref = useRef()
  const [width, setWidth] = useState(0)
  useEffect(() => {
    setWidth(measureElement(ref.current).width)
  })
  return (
    <Box ref={ref}>
      <Text>{truncate(title, width)}</Text>
    </Box>
  )
}

// Silvery: dimensions available during render, no ref needed
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}
```

Key differences:

- **No ref** — dimensions come from the layout engine, not DOM measurement
- **Available during render** — no `useEffect` delay, no flash of wrong content
- **Automatic updates** — rerenders when parent resizes, no manual subscription
- Ink's `measureElement()` still works in Silvery for compat, but prefer `useContentRect()`

### 4. Focus System Differences

Ink provides tab-order focus (`useFocus()`). Silvery provides tree-based spatial focus (`useFocusable()`). The Ink compat layer bridges them:

```tsx
import { withInk } from "@silvery/tea/plugins"
// Enables Ink's useFocus, useFocusManager
```

For new code, prefer `useFocusable()` -- it supports spatial navigation, focus scopes, and click-to-focus.

## Incremental Adoption

You don't have to migrate everything at once. The compat layer lets you run Ink APIs alongside Silvery-native ones:

1. **Start**: Swap imports, add `await`, run tests
2. **Simplify**: Remove width prop threading, use `useContentRect()`
3. **Enhance**: Add `overflow="scroll"`, mouse events, spatial focus
4. **Optimize**: Drop the compat layer plugins as you adopt native APIs

## Getting Help

- [Silvery vs Ink](/guide/silvery-vs-ink) -- detailed comparison with benchmarks
- [Quick Start](/getting-started/quick-start) -- fresh start guide
- [GitHub Issues](https://github.com/beorn/silvery/issues) -- tag with `migration`
