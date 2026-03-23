# Silvery

**Polished Terminal UIs in React.**

Responsive layouts, scrollable containers, 100x+ faster incremental updates, and full support for modern terminal capabilities. 30+ components from TextInput to VirtualList. Pure TypeScript, no WASM.

> **Status:** Alpha — under active development. APIs may change. Early adopters and feedback welcome.

```
npm install silvery react
```

```tsx
import { useState } from "react"
import { render, Box, Text, useInput, createTerm } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Count: {count}</Text>
    </Box>
  )
}

using term = createTerm()
await render(<Counter />, term).run()
```

## What You Get

- **30+ components** — TextInput, TextArea, SelectList, VirtualList, Table, Tabs, CommandPalette, ModalDialog, SplitView, Toast, and more. All with keyboard navigation, focus, and scrolling built in.
- **Responsive layout** — `useContentRect()` returns actual dimensions synchronously. Components adapt to their space immediately.
- **Scrollable containers** — `overflow="scroll"` with automatic measurement and clipping.
- **Theme system** — 38 palettes with semantic tokens (`$primary`, `$error`, `$border`). Auto-detects your terminal's colors.
- **Focus navigation** — scoped focus, arrow-key directional movement, click-to-focus.
- **Mouse support** — full SGR protocol with `onClick`, `onMouseDown`, `onWheel`, hit testing, drag.
- **Incremental rendering** — per-node dirty tracking. ~170us for interactive updates in a 1000-node tree.
- **Zero native dependencies** — pure JS layout engine ([Flexily](https://beorn.github.io/flexily)), no yoga binary, no WASM.

## Compared to Ink

[Ink](https://github.com/vadimdemedes/ink) pioneered React in the terminal and remains a great choice for many apps. Silvery builds on that foundation with additional capabilities for complex interactive UIs — focus management, scrollable containers, mouse support, text editing, virtual lists, theming, and incremental rendering.

If you're already using Ink, `@silvery/ink` provides a compatibility layer for gradual migration.

## Packages

| Package | Description |
|---|---|
| `silvery` | Components, hooks, renderer — the one package you need |
| `@silvery/tea` | Optional [TEA](https://guide.elm-lang.org/architecture/) state management for complex apps |
| `@silvery/test` | Testing utilities and locators |
| `@silvery/ink` | Ink compatibility layer |

## Ecosystem

| Project | What |
|---|---|
| [Termless](https://termless.dev) | Headless terminal testing — like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM) |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing |

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

## License

MIT
