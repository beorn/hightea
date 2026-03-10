# Silvery

**A React framework for building terminal applications.**

Silvery gives you the full React component model -- JSX, hooks, reconciliation -- with a rendering architecture designed for interactive terminal UIs. Components know their dimensions during render, containers scroll natively, input events bubble through a DOM-style layer stack, and only changed nodes re-render.

It ships 30+ built-in components, a command/keybinding system, mouse support, a theme engine with 45 palettes, and three composable runtime architectures (React hooks, TEA reducers, Zustand stores). Pure TypeScript, no WASM, no native dependencies.

```
npm install silvery react
```

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

## Key Capabilities

### Layout feedback during render

`useContentRect()` returns actual dimensions synchronously -- no post-layout effect, no `{width: 0, height: 0}` on first render. Components adapt to their available space immediately.

```tsx
function Responsive() {
  const { width } = useContentRect()
  return width > 80 ? <FullDashboard /> : <CompactView />
}
```

### Scrollable containers

`overflow="scroll"` with `scrollTo` -- the framework handles measurement, clipping, and scroll position. No manual virtualization needed.

```tsx
<Box height={20} overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

### Per-node dirty tracking

Seven independent dirty flags per node. When a user presses a key, only the affected nodes re-render -- bypassing React reconciliation entirely for unchanged subtrees. Typical interactive updates complete in ~170 microseconds for 1000 nodes, compared to full-tree re-renders.

### Input layer stack

DOM-style event bubbling with modal isolation. Opening a dialog automatically captures input -- no manual guard checks in every handler.

```tsx
<InputLayerProvider>
  <Board />
  {isOpen && <Dialog />} {/* Dialog captures input; Board doesn't see it */}
</InputLayerProvider>
```

### Spatial focus navigation

Tree-based focus with scopes, arrow-key directional movement, click-to-focus, and `useFocusWithin`. Go beyond tab-order.

### Command and keybinding system

Named commands with IDs, help text, configurable keybindings, and runtime introspection. Build discoverable, AI-automatable interfaces.

```tsx
const MyComponent = withCommands(BaseComponent, () => [
  { id: "save", label: "Save", keys: ["ctrl+s"], action: () => save() },
  { id: "quit", label: "Quit", keys: ["q", "ctrl+c"], action: () => exit() },
])
```

### Mouse support

SGR mouse protocol with DOM-style event props -- `onClick`, `onMouseDown`, `onWheel`, hit testing, drag support.

### Multi-line text editing

Built-in `TextArea` with word wrap, scrolling, cursor movement, selection, and undo/redo via `EditContext`.

### 30+ built-in components

VirtualList, TextArea, TextInput, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Image, Toast, Spinner, ProgressBar, SplitView, Console, and more -- with built-in scrolling, focus, and input handling.

### Theme system

`@silvery/theme` with 45 built-in palettes and semantic color tokens (`$primary`, `$error`, `$border`, etc.) that adapt automatically.

### TEA state machines

Optional [Elm Architecture](https://guide.elm-lang.org/architecture/) alongside React hooks. Pure `(action, state) -> [state, effects]` functions for testable, replayable, undoable UI logic.

### Multi-target rendering

Terminal today, Canvas 2D and DOM available now. Same React components, different rendering backends.

## Packages

| Package                              | Description                               |
| ------------------------------------ | ----------------------------------------- |
| [`silvery`](packages/)               | Umbrella -- re-exports `@silvery/react`   |
| [`@silvery/react`](packages/react)   | React reconciler, hooks, renderer         |
| [`@silvery/term`](packages/term)     | Terminal rendering pipeline, ANSI styling |
| [`@silvery/ui`](packages/ui)         | Component library (30+ components)        |
| [`@silvery/theme`](packages/theme)   | Theming with 45 palettes                  |
| [`@silvery/tea`](packages/tea)       | TEA state machine store                   |
| [`@silvery/compat`](packages/compat) | Ink/Chalk compatibility layers            |
| [`@silvery/test`](packages/test)     | Testing utilities and locators            |

## Ink Compatibility

If you have an existing Ink app, `silvery/ink` and `silvery/chalk` provide compatibility layers for migration. The core API (`Box`, `Text`, `useInput`, `render`) is intentionally familiar -- most Ink code works with minimal changes. See the [migration guide](docs/guide/migration.md) for details.

## Ecosystem

| Project                                    | What                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| [Termless](https://termless.dev)           | Headless terminal testing -- like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM)     |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing                           |

## Performance

_Apple M1 Max, Bun 1.3.9. Reproduce: `bun run bench:compare`_

| Scenario                                | Silvery | Ink     |
| --------------------------------------- | ------- | ------- |
| Cold render (1 component)               | 165 us  | 271 us  |
| Cold render (1000 components)           | 463 ms  | 541 ms  |
| Typical interactive update (1000 nodes) | 169 us  | 20.7 ms |
| Layout (50-node kanban)                 | 57 us   | 88 us   |

The "typical interactive update" row is what matters for real apps. When a user presses a key, silvery's dirty tracking updates only the changed nodes (169 us). Ink re-renders the full React tree and runs complete layout (20.7 ms). For the updates that actually happen during interactive use, silvery is 100x+ faster.

Full re-renders where the entire component tree changes are faster in Ink (string concatenation vs silvery's 5-phase pipeline). But that scenario rarely occurs in interactive applications.

## Documentation

Full docs at [silvery.dev](https://silvery.dev) -- getting started guide, API reference, component catalog, and Ink migration guide.

## Development

```bash
bun install
bun test
bun run lint
```

## License

MIT
