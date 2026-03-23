# Silvery

**React for terminals.** Start as simply as Ink. Scale into real terminal apps.

Responsive layouts, scrollable containers, 30+ production components, 38 themes, and 100x faster incremental updates. Pure TypeScript — no native dependencies, no WASM.

```
npm install silvery react
```

> **Status:** Alpha — under active development. APIs may change. Early adopters and feedback welcome.

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

```tsx
import { useState } from "react"
import { render, Box, Text, useInput, useContentRect, createTerm } from "silvery"

function App() {
  const { width } = useContentRect()
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Counter ({width} cols wide)</Text>
      <Text>Count: {count}</Text>
      <Text dim>j/k = change, q = quit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term).run()
```

## Why Silvery

### Start familiar

Same React you know — components, hooks, JSX. `useState` and `useInput` for simple apps. No new paradigm to learn.

### Scale without switching

When your app grows, silvery grows with it: TextInput, SelectList, VirtualList, focus scopes, command palette, split panes, scrollback search — all built in. No "you've outgrown the framework" moment.

### Works everywhere

Zero native dependencies. No yoga binary, no WASM, no build steps. Works on macOS, Linux, Windows, Alpine, CI, Docker, SSH — anywhere Node.js or Bun runs. Bundle into a single file with esbuild.

## Renderer

### Responsive layout

`useContentRect()` returns actual dimensions synchronously — no post-layout effect, no `{width: 0, height: 0}` on first render.

```tsx
function Responsive() {
  const { width } = useContentRect()
  return width > 80 ? <FullDashboard /> : <CompactView />
}
```

### Scrollable containers

`overflow="scroll"` with `scrollTo` — measurement, clipping, and scroll position handled automatically.

```tsx
<Box height={20} overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item) => <Card key={item.id} item={item} />)}
</Box>
```

### Per-node dirty tracking

Seven independent dirty flags per node. Interactive updates complete in ~170 microseconds for 1000 nodes (vs 20+ ms for full-tree re-renders). Only changed nodes update.

### Multi-target rendering

Terminal today, Canvas 2D and DOM experimental. Same React components, different rendering backends.

## Components

### 30+ built-in components

TextInput, TextArea, SelectList, VirtualList, Table, CommandPalette, ModalDialog, Tabs, TreeView, SplitView, Toast, ProgressBar, Spinner, Image, and more — all with built-in scrolling, focus, and keyboard handling.

### Multi-line text editing

Built-in `TextArea` with word wrap, scrolling, cursor movement, selection, and undo/redo.

### Theme system

38 built-in palettes with semantic color tokens (`$primary`, `$error`, `$border`, etc.) that auto-detect your terminal's colors and adapt.

## Terminal Features

### Mouse support

SGR mouse protocol with DOM-style event props — `onClick`, `onMouseDown`, `onWheel`, hit testing, drag support.

### Spatial focus navigation

Tree-based focus with scopes, arrow-key directional movement, click-to-focus, and `useFocusWithin`. Beyond tab-order.

### Input layer stack

DOM-style event bubbling with modal isolation. Opening a dialog automatically captures input — no manual guard checks in every handler.

```tsx
<InputLayerProvider>
  <Board />
  {isOpen && <Dialog />} {/* Dialog captures input; Board doesn't see it */}
</InputLayerProvider>
```

## Optional: Application Architecture

For complex apps with commands, keybindings, and structured state management, `@silvery/tea` adds an optional [Elm Architecture](https://guide.elm-lang.org/architecture/) layer. Pure `(action, state) -> [state, effects]` functions for testable, replayable, undoable logic.

```
npm install @silvery/tea
```

Most apps don't need this — `useState` and `useReducer` work great. Reach for TEA when your app has command palettes, configurable keybindings, or undo/redo.

## Packages

| Package | Description |
|---|---|
| [`silvery`](packages/) | Components, hooks, renderer — the one package you need |
| [`@silvery/tea`](packages/tea) | Optional TEA state machine store |
| [`@silvery/test`](packages/test) | Testing utilities and locators |
| [`@silvery/compat`](packages/compat) | Ink/Chalk compatibility layers |

Internal packages (you rarely import these directly):

| Package | Description |
|---|---|
| [`@silvery/react`](packages/react) | React reconciler |
| [`@silvery/term`](packages/term) | Terminal rendering pipeline |
| [`@silvery/ui`](packages/ui) | Component library |
| [`@silvery/theme`](packages/theme) | Theme engine and palettes |

## Compatibility

`silvery/ink` and `silvery/chalk` provide compatibility layers for existing React terminal apps. The core API (`Box`, `Text`, `useInput`, `render`) is intentionally familiar — most existing code works with minimal changes. See the [migration guide](docs/guide/migration.md) for details.

## When to Use Silvery

**Use silvery when your CLI stops being a prompt and starts becoming an app.** Dashboards, editors, kanban boards, chat interfaces, log viewers — anything with scrollable containers, keyboard navigation, focus management, or components that adapt to their size.

For one-shot prompts or spinners, a prompt library may be simpler. But if you find yourself reaching for "just one more feature," silvery is designed so you never outgrow it.

## Ecosystem

| Project | What |
|---|---|
| [Termless](https://termless.dev) | Headless terminal testing — like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM) |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing |

## Performance

_Apple M1 Max, Bun 1.3.9. Reproduce: `bun run bench:compare`_

| Scenario | Silvery | Ink 5 |
|---|---|---|
| Cold render (1 component) | 165 us | 271 us |
| Cold render (1000 components) | 463 ms | 541 ms |
| Typical interactive update (1000 nodes) | 169 us | 20.7 ms |
| Layout (50-node kanban) | 57 us | 88 us |

Interactive updates — the ones that dominate real use (cursor move, scroll, toggle) — are ~100x faster thanks to per-node dirty tracking.

## Documentation

Full docs at [silvery.dev](https://silvery.dev) — getting started guide, API reference, component catalog, and migration guide.

## Development

```bash
bun install
bun test
bun run lint
```

## License

MIT
