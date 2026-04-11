---
url: /guide/faq.md
description: >-
  Frequently asked questions about Silvery — installation, Ink compatibility,
  performance, components, testing, and terminal support.
---

# FAQ

Frequently asked questions about Silvery.

## What is Silvery?

Polished terminal apps in React. Silvery provides 45+ components, layout-first rendering with per-node dirty tracking, responsive layout via `useBoxRect()`, and full support for modern terminal protocols. It works with Bun and Node.js (23.6+).

If you know React, you know Silvery -- the core API (`Box`, `Text`, `useInput`, `render`) is familiar. What's different is the rendering pipeline: layout runs first, so components know their size during render, and only changed nodes are re-rendered.

Three principles guide the project: take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

## How does Silvery compare to Ink?

Both use React for terminal UIs. Silvery differs in several key ways:

* **Layout-first rendering** — layout runs before content render, so components know their size during render via `useBoxRect()`. No components rendering at `width: 0`, no cascading measure→rerender cycles. See [Silvery vs Ink](/guide/silvery-vs-ink#responsive-layout).
* **Fast incremental rendering** — cell-level dirty tracking. 3–27× faster (typically 15–20×) than Ink in our mounted rerender benchmarks. See the [detailed benchmarks](/guide/silvery-vs-ink#performance--size).
* **Bundle parity with Ink+Yoga** — 114.9 KB gzipped runtime vs Ink+Yoga's 116.6 KB. Pure TypeScript, zero WASM, zero native dependencies.
* **Larger component library** — 45+ components (vs Ink's 6 core + [@inkjs/ui](https://github.com/vadimdemedes/ink-ui)'s 13), including VirtualList, CommandPalette, TreeView, SplitView, Table, and Form
* **Terminal protocol support** — Kitty keyboard, SGR mouse, synchronized output (DEC 2026), Sixel/Kitty graphics, clipboard, and more
* **Dynamic inline scrollback** — live React zone at the bottom, completed items graduate to terminal-owned scrollback. Cmd+F works natively.

Ink has a larger ecosystem (~1.3M weekly downloads, 50+ community components) and is the established standard. For a detailed breakdown, see [Silvery vs Ink](/guide/silvery-vs-ink).

## Is Silvery compatible with existing Ink code?

Yes. Silvery provides compatibility layers via `silvery/ink` and `silvery/chalk` that pass ~99% of Ink 7.0's test suite (918/931 tests). Most Ink code works by changing import paths:

```ts
// Before
import { Box, Text } from "ink"
import chalk from "chalk"

// After
import { Box, Text } from "silvery/ink"
import chalk from "silvery/chalk"
```

For new code, use Silvery's native APIs to take advantage of responsive layout and the full component library. See the [migration guide](/getting-started/migrate-from-ink) for step-by-step instructions.

## How fast is Silvery compared to Ink?

Silvery is **3–27× faster (typically 15–20×)** than Ink 7.0 in our mounted rerender benchmarks. Both frameworks keep a mounted app and call `rerender()`.

| Scenario                               | Silvery advantage |
| -------------------------------------- | ----------------- |
| Cursor move 20-item (all visible)      | **2.7×**          |
| Cursor move 100-item                   | **3.1×**          |
| Kanban move editing marker             | **3.3×**          |
| Memo'd cursor highlight 100 (inverse)  | **5.3×**          |
| Memo'd cursor highlight 1000 (inverse) | **6.1×**          |
| Memo'd 100-item single toggle          | **5.1×**          |
| Memo'd 500-item single toggle          | **5.7×**          |
| Memo'd kanban 5×20 move editing marker | **4.3×**          |

Both are fast enough for 60fps at typical terminal sizes. Silvery's cell-level dirty tracking and per-node skip give it an advantage across all mounted workloads.

Beyond CPU time, Silvery's cell-level output phase emits **10–20× less output** to the terminal than Ink's line-level diff on incremental updates.

Methodology: synchronous rerender throughput. Ink `debug: true` (no throttle), `incrementalRendering: true`. Silvery uses `@silvery/test` `createRenderer` (production render core). Both use mocked stdout. See the [full benchmarks](/guide/silvery-vs-ink#performance--size) for details.

## What components does Silvery include?

45+ components across several categories:

* **Layout:** Box, Spacer, Fill, Newline, Divider, SplitView
* **Input:** TextInput, TextArea, SelectList, CommandPalette, Form, Toggle, SearchBar
* **Display:** Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast, Tooltip, Skeleton
* **Navigation:** TreeView, ListView, VirtualList, Breadcrumb
* **Containers:** Screen, ModalDialog, PickerDialog, ScrollbackView, ScrollbackList, ErrorBoundary, Console

See the [component catalog](/guides/components) for usage examples and API documentation.

## Does Silvery work with Node.js and Bun?

Yes. Silvery is pure TypeScript with no native dependencies or WASM. It works with:

* **Bun** -- any version, natively handles TypeScript
* **Node.js 23.6+** -- uses native TypeScript type stripping (no compilation step)

The package ships TypeScript source directly. There is no build step, no `dist/` directory, and no compiled JavaScript.

## How do I test Silvery apps?

Silvery provides two testing approaches:

**Fast unit tests** with `createRenderer()` from `@silvery/test`. This is a headless renderer that produces stripped text output for assertions:

```tsx
import { createRenderer } from "@silvery/test"

const app = createRenderer(<MyComponent />)
expect(app.text).toContain("Hello")
```

**Full terminal tests** with `createTermless()`, which runs a real xterm.js terminal emulator in-process. This verifies actual ANSI output, colors, scrollback, and cursor positioning:

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
expect(term.screen).toContainText("Hello")
```

See the [testing guide](/guide/testing) for more patterns.

## Does Silvery support mouse input?

Yes. Silvery supports the full SGR extended mouse protocol:

* **Click events:** `onClick`, `onMouseDown`, `onMouseUp` on Box components
* **Movement:** `onMouseMove` for hover effects and drag interactions
* **Scroll:** Mouse wheel events via the mouse protocol
* **Extended coordinates:** SGR mode supports coordinates beyond column/row 223
* **Focus reporting:** Focus in/out events when the terminal window gains or loses focus
* **Cursor shape:** OSC 22 mouse cursor shape control (pointer, text, crosshair)

Mouse support is auto-detected and enabled when the terminal supports it.

## What terminal emulators does Silvery support?

Silvery works with any terminal that supports basic ANSI escape sequences. Modern features are auto-detected at startup using terminal queries (DA1, DA2, XTVERSION) and enabled when available:

* **Full support:** Ghostty, Kitty, WezTerm, iTerm2
* **Good support:** Alacritty, Windows Terminal, Hyper
* **Basic support:** Terminal.app, older xterm builds

Auto-detected features include Kitty keyboard protocol, truecolor, synchronized output, graphics protocols, and clipboard access. See [terminfo.dev](https://terminfo.dev) for detailed compatibility data across terminal emulators.

## How does theming work in Silvery?

Silvery ships 38 color palettes with semantic tokens:

```tsx
<Box borderStyle="round" borderColor="$primary">
  <Text color="$success">Saved</Text>
  <Text color="$muted">Last updated 2 min ago</Text>
</Box>
```

Themes auto-detect the terminal's background color (via OSC 11 query) and adjust for WCAG-compliant contrast. Use `ThemeProvider` to set a palette globally, or override per-component.

See the [styling guide](/guide/styling) for token reference and the [theme explorer](/themes) to preview all 38 palettes.

## Is Silvery production-ready?

Silvery is actively developed and used in production by a complex TUI application with thousands of nodes, multiple views, and rich interactions. The rendering pipeline is exercised by property-invariant fuzz tests that verify idempotence, no-op stability, inverse operations, and viewport clipping.

The API surface is stabilizing but may have breaking changes before 1.0. If you're building something that needs long-term API stability, pin your version and watch the changelog.

## Does Silvery have TypeScript support?

Silvery is written entirely in TypeScript with strict mode enabled. All components, hooks, and APIs are fully typed. The package ships TypeScript source directly -- no compiled JavaScript, no type declaration files. This means you get full type information including inline documentation in your editor.

## How does the layout engine work?

Silvery uses [Flexily](https://beorn.codes/flexily), a Yoga-compatible flexbox layout engine written in pure TypeScript. The key difference from other terminal frameworks:

1. **Layout runs first** -- Flexily calculates positions and sizes before React renders components
2. **Components access dimensions** -- `useBoxRect()` provides width, height, x, y during render
3. **Flexbox model** -- standard CSS flexbox properties (`flexDirection`, `justifyContent`, `alignItems`, `flexGrow`, `flexShrink`, `gap`, etc.)
4. **No WASM** -- pure TypeScript, 2.5× faster than Yoga WASM for typical terminal layouts

This enables responsive layouts (columns that adapt to terminal width), native `overflow="scroll"` containers, and automatic text truncation -- all without post-render measurement.

## Can I use Silvery for fullscreen terminal apps?

Yes. Silvery supports two modes:

* **Fullscreen** (default) -- alternate screen buffer, absolute positioning, incremental diff. Best for interactive apps (editors, dashboards, games).
* **Inline** -- normal scrollback, relative positioning. Best for CLIs that output results and exit, or tools that mix interactive and scrolling output.

Both modes use incremental rendering for efficient updates. The mode is set at startup and affects only the output phase, not components or state management.

## How do I migrate from Ink to Silvery?

Three steps:

1. **Swap imports** -- replace `ink` with `silvery/ink` and `chalk` with `silvery/chalk`
2. **Run your tests** — ~99% of Ink 7.0's test suite (918/931) passes with the compatibility layer
3. **Adopt native APIs gradually** -- use `useBoxRect()` for responsive layouts, replace manual key handlers with `SelectList`, add themes with semantic tokens

The compatibility layer is a bridge, not a destination. New code should use Silvery's native APIs to get the full benefit of layout-first rendering and the component library.

See the [migration guide](/getting-started/migrate-from-ink) for detailed instructions and common patterns.
