# inkx

React for modern terminals.

Terminals have evolved -- Kitty, Ghostty, WezTerm support graphics, mouse tracking, keyboard protocols, clipboard access. inkx brings all of it to React. Full mouse and keyboard support, inline images, scrollable containers, layout-aware components, and a hybrid React/Elm architecture -- in one framework, with zero native dependencies.

[![npm version](https://img.shields.io/npm/v/inkx.svg)](https://www.npmjs.com/package/inkx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

![Dashboard example](docs/images/dashboard.png)

## Why inkx?

**Components that know their size.** `useContentRect()` gives every component its rendered width and height -- synchronously, during render. No prop drilling, no second pass. This is [Ink's oldest open issue](https://github.com/vadimdemedes/ink/issues/5) (2016), solved.

**Every modern terminal protocol.** [Kitty keyboard](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (all 5 flags including Cmd/Super), SGR mouse (click, drag, scroll with DOM-style event bubbling), inline images (Kitty graphics + Sixel), OSC 52 clipboard (works over SSH), OSC 8 hyperlinks, DECSTBM scroll regions, synchronized updates (flicker-free in tmux/Zellij), and bracketed paste. All built-in, all auto-detected, all with graceful fallback.

**122x faster interactive updates.** Per-node dirty tracking with 7 independent dirty flags per node. When a user presses a key, only changed nodes re-render -- [169us for 1000 nodes vs Ink's 20.7ms](docs/benchmarks.md). Buffer diffing emits only changed cells, reducing terminal I/O by 90%+.

## Built for AI-Powered CLIs

inkx is designed to be driven by AI agents, not just humans:

- **Command introspection** -- every action has an ID, name, help text, and keybindings. An agent can list all available commands and invoke them by name.
- **Programmatic screenshots** -- `app.screenshot()` renders the buffer to PNG. No TTY server, no external processes.
- **State query** -- `app.getState()` returns screen content, command list, and focus state.
- **CLAUDE.md ships with the package** -- AI coding agents get full API docs, patterns, and anti-patterns automatically.

## Quick Start

```bash
bun add inkx react @beorn/flexx
```

```tsx
import { useState } from "react"
import { run, useInput } from "inkx/runtime"
import { Box, Text, useContentRect } from "inkx"

function App() {
  const { width } = useContentRect()
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column">
      <Text>Terminal width: {width}</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await run(<App />)
```

## Key Features

### Layout and Rendering

- **`useContentRect()` / `useScreenRect()`** -- components query their own dimensions synchronously during render
- **Five-phase incremental pipeline** -- 7 independent dirty flags per node, only changed nodes re-render
- **Flexx layout engine** (default) -- pure TypeScript, 7KB gzipped, zero WASM, zero memory growth
- **Layout caching** -- Flexx fingerprints nodes; unchanged subtrees skip recomputation entirely
- **Buffer diff** -- emits only changed cells to terminal, reducing I/O by 90%+ for typical updates
- **Synchronized output** (DEC 2026) -- atomic screen painting, flicker-free in tmux/Zellij

### Terminal Protocols

- **Kitty keyboard** -- all 5 flags: Cmd/Super, Hyper, key release events, international layouts. Auto-detect.
- **SGR mouse** -- DOM-style event bubbling: `onClick`, `onDoubleClick`, `onWheel`, `onMouseEnter` on any component
- **Inline images** -- Kitty graphics + Sixel with auto-detection and text fallback
- **OSC 52 clipboard** -- copy/paste that works across SSH sessions
- **OSC 8 hyperlinks** -- clickable URLs via `<Link>` component
- **Bracketed paste** -- built-in with `usePaste` hook
- **DECSTBM scroll regions** -- hardware-accelerated scrolling
- **Adaptive rendering** -- graceful degradation for non-TTY output

### Components (23+)

- **Core:** Box, Text, Newline, Spacer, Static, Transform
- **Input:** TextInput, ReadlineInput, TextArea (multi-line with readline shortcuts)
- **Data:** VirtualList, SelectList, Table, Console
- **Display:** Spinner, ProgressBar, Badge, Divider, Image, Link
- **`overflow="scroll"`** with `scrollTo` -- scrollable containers without manual virtualization ([Ink's #1 feature request](https://github.com/vadimdemedes/ink/issues/222) since 2019, solved)

### Input and Focus

- **Input layer stack** -- DOM-style event bubbling for modal dialogs and text input isolation
- **Tree-based focus** -- scopes, spatial navigation (Up/Down/Left/Right), autoFocus, click-to-focus
- **Command system** -- every action gets an ID, name, help text, and configurable keybinding
- **Keybinding resolution** -- keypresses route through bindings to commands; searchable command palette for free
- **Hotkey parsing** -- native macOS symbols: `parseHotkey("⌘K")`, `matchHotkey(key, "⌃⇧A")`

### Three Runtime Architectures

| Layer | Entry Point       | Style         | Best For                       |
| ----- | ----------------- | ------------- | ------------------------------ |
| 1     | `createRuntime()` | Elm-inspired  | Pure reducer + event stream    |
| 2     | `run()`           | React hooks   | Most apps (recommended)        |
| 3     | `createApp()`     | Zustand store | Complex apps with many sources |

Each wraps the one below. Layer 1 is a pure event loop (`reducer(state, event) -> state`). Layer 2 adds React hooks. Layer 3 adds centralized state with a provider. Choose the right paradigm per use case -- no other TUI framework offers all three.

### Developer Experience

- **Drop-in Ink replacement** -- same Box, Text, useInput, useApp, Static, Spacer
- **Playwright-style testing** -- `createRenderer`, `getByTestId`, `getByText`, `locator()`, `app.press()`
- **Plugin composition** -- `withCommands`, `withKeybindings`, `withDiagnostics` (SlateJS-inspired)
- **Screenshot capture** -- `app.screenshot()` renders buffer to PNG via Playwright
- **withDiagnostics** -- incremental vs fresh render verification catches regressions in CI
- **Theming** -- `ThemeProvider` with semantic `$token` colors (dark/light built-in)
- **28+ unicode utilities** -- grapheme splitting, display width, CJK/emoji support
- **React 19** -- `use()`, improved Suspense, Actions
- **Zero native dependencies** -- pure TypeScript, runs on Node, Bun, Deno

## Architecture

| Layer          | Description                   | Render Targets |
| -------------- | ----------------------------- | -------------- |
| React 19       | Reconciler + hooks            | --             |
| Five-phase pipeline | Measure, layout, content, output, buffer | -- |
| RenderAdapter  | Platform abstraction          | Terminal, Canvas, DOM |

See [architecture deep dive](docs/deep-dives/architecture.md) for the full pipeline diagram.

## Trade-offs

inkx optimizes for interactive apps where parts of the UI update frequently. For workloads that re-render the entire component tree from scratch (not typical for interactive CLIs), Ink's simpler reconciliation is [~30x faster](docs/benchmarks.md). inkx's five-phase pipeline is the cost of layout feedback -- and the reason interactive updates are [122x faster](docs/benchmarks.md). See [detailed comparison](docs/inkx-vs-ink.md).

## Ink Compatibility

Drop-in replacement for [Ink](https://github.com/vadimdemedes/ink). Same components, same hooks API:

```tsx
// Before (Ink)
import { render, Box, Text, useInput, useApp } from "ink"

// After (inkx)
import { render, Box, Text, useApp } from "inkx"
import { useInput } from "inkx/runtime"
```

See [migration guide](docs/guides/migration.md) for details.

## Status

Actively developed and used in production ([km](https://github.com/beorn/km), a terminal workspace for knowledge workers). APIs may change. The core architecture (reconciler, layout hooks, five-phase pipeline, plugin system) has been stable through months of daily production use.

| Feature                                            | Status     |
| -------------------------------------------------- | ---------- |
| Core components (Box, Text, VirtualList, inputs)   | Stable     |
| Hooks (useContentRect, useInput, useApp, useTerm)  | Stable     |
| React reconciler (React 19)                        | Stable     |
| Flexx layout engine                                | Stable     |
| Plugin system (commands, keybindings, diagnostics) | Stable     |
| Terminal target                                    | Production |
| Canvas / DOM targets                               | Prototype  |

## Examples

```bash
bun run examples/dashboard/index.tsx      # Multi-pane dashboard
bun run examples/kanban/index.tsx         # 3-column kanban board
bun run examples/task-list/index.tsx      # Scrollable task list
bun run examples/search-filter/index.tsx  # useTransition + useDeferredValue
bun run examples/async-data/index.tsx     # Suspense + async loading
bun run examples/textarea/index.tsx       # Multi-line text input
bun run examples/scrollback/index.tsx     # Scrollback mode (frozen items)
```

See [examples/index.md](examples/index.md) for descriptions and the [live demo](https://beorn.github.io/inkx/examples/live-demo) running in the browser via xterm.js.

## Documentation

Full docs at **[beorn.github.io/inkx](https://beorn.github.io/inkx/)**

| Document                                          | Description                                    |
| ------------------------------------------------- | ---------------------------------------------- |
| [Getting Started](docs/guides/getting-started.md) | First app tutorial, basic input, layout        |
| [Runtime Layers](docs/guides/runtime-layers.md)   | createRuntime, createStore, createApp, streams |
| [Components](docs/reference/components.md)        | Box, Text, VirtualList, Console, inputs        |
| [Hooks](docs/reference/hooks.md)                  | useContentRect, useInput, useApp, useTerm      |
| [Architecture](docs/deep-dives/architecture.md)   | Pipeline, RenderAdapter interface              |
| [Testing](docs/testing.md)                        | Strategy, locators, withDiagnostics            |
| [Performance](docs/deep-dives/performance.md)     | Optimization techniques and profiling          |
| [Benchmarks](docs/benchmarks.md)                  | Raw benchmark tables and data                  |
| [inkx vs Ink](docs/inkx-vs-ink.md)                | Feature and performance comparison with Ink    |
| [Plugins](docs/reference/plugins.md)              | withCommands, withKeybindings, withDiagnostics |
| [Migration](docs/guides/migration.md)             | Ink -> inkx guide                              |

## Related Projects

| Project                                    | Role                                            |
| ------------------------------------------ | ----------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink) | API compatibility target                        |
| [Flexx](https://github.com/beorn/flexx)    | Default layout engine (2.5x faster, 5x smaller) |
| [Yoga](https://yogalayout.dev/)            | Optional layout engine (WASM)                   |

## License

MIT
