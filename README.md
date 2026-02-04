# Inkx

**Ink, but components know their size.**

A React-based terminal UI framework where components can query their computed dimensions via `useContentRect()`. Drop-in Ink replacement with layout feedback.

## Installation

```bash
bun add inkx
```

## Quick Start

```tsx
import { render, Box, Text, useContentRect, createTerm } from "inkx"

function Card() {
  const { width } = useContentRect() // Components know their size!
  return <Text>{truncate(title, width)}</Text>
}

using term = createTerm()
await render(<App />, term)
```

## The Problem Inkx Solves

Ink renders components _before_ layout calculation. Components can't know their dimensions, forcing you to manually thread width props through every layer:

```tsx
// Ink: width props cascade through entire tree
<Board width={80}>
  <Column width={26}>
    <Card width={24} />
  </Column>
</Board>

// Inkx: just ask
<Board>
  <Column>
    <Card />  {/* useContentRect() inside */}
  </Column>
</Board>
```

## Key Features

| Feature             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| **Layout feedback** | `useContentRect()` returns `{ width, height, x, y }` |
| **Scrolling**       | `overflow="scroll"` with `scrollTo={index}`          |
| **Term injection**  | `useTerm()` for styling and capability detection     |
| **Console capture** | `<Console />` component for log output               |
| **React 19**        | forwardRef, ErrorBoundary, Suspense, useTransition   |
| **Flexx layout**    | 2.5x faster than Yoga, 5x smaller bundle             |

## inkx/runtime (Recommended)

The new `inkx/runtime` module provides a layered, AsyncIterable-first architecture.

```tsx
import { run, useInput, type Key } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

**Three layers:**

| Layer | Entry             | Best For                   |
| ----- | ----------------- | -------------------------- |
| 1     | `createRuntime()` | Maximum control, Elm-style |
| 2     | `run()`           | React hooks (recommended)  |
| 3     | `createApp()`     | Complex apps with Zustand  |

## Status

**Alpha** - core functionality complete, used in production apps.

- Core components (Box, Text) - Complete
- Hooks (useContentRect, useInput, useApp, useTerm) - Complete
- React reconciler (React 19 compatible) - Complete
- Flexx layout engine (default) - Complete
- Yoga layout engine (WASM, optional) - Complete

## Examples

```bash
bun run examples/dashboard/index.tsx      # Multi-pane dashboard
bun run examples/kanban/index.tsx         # 3-column kanban board
bun run examples/task-list/index.tsx      # Scrollable task list
bun run examples/search-filter/index.tsx  # useTransition + useDeferredValue
bun run examples/async-data/index.tsx     # Suspense + async loading
bun run examples/layout-ref/index.tsx     # forwardRef + onLayout
```

See [examples/index.md](examples/index.md) for descriptions.

## Documentation

| Resource                                         | Description                      |
| ------------------------------------------------ | -------------------------------- |
| [CLAUDE.md](CLAUDE.md)                           | Full API reference               |
| [examples/](examples/)                           | Runnable examples with source    |
| [docs/internals.md](docs/internals.md)           | Architecture and reconciler      |
| [docs/ink-comparison.md](docs/ink-comparison.md) | Detailed Ink comparison          |
| [docs/architecture.md](docs/architecture.md)     | Layer diagram, RenderAdapter     |
| [docs/roadmap.md](docs/roadmap.md)               | Canvas, React Native, and beyond |

## Related Projects

| Project                                    | Role                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink) | API compatibility target. Inkx is a drop-in replacement. |
| [Flexx](../beorn-flexx/)                   | Default layout engine (2.5x faster, 5x smaller).         |
| [Yoga](https://yogalayout.dev/)            | Optional layout engine (WASM, more mature).              |

## License

MIT
