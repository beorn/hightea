# Silvery Roadmap

This document outlines the vision for Silvery — not a commitment, but an exploration of where the two-phase rendering pattern could go.

## Contents

- [Overview](#overview)
- [Terminal (Complete)](#terminal-complete)
- [Web Targets (Canvas, DOM, WebGL)](#web-targets-canvas-dom-webgl)
- [React Native](#react-native)
- [Beyond React](#beyond-react)
- [Specialized Targets](#specialized-targets)
- [Plugin Composition](#plugin-composition)

## Overview

| Target       | Value             | Status         | Why                                                          |
| ------------ | ----------------- | -------------- | ------------------------------------------------------------ |
| Terminal     | **High** (proven) | ✅ Complete    | Original use case, working in production                     |
| Canvas 2D   | **High**          | ✅ Implemented | No existing React layout solution for canvas                 |
| DOM          | **Medium**        | ✅ Implemented | Accessibility, text selection (xterm.js pattern)             |
| WebGL        | **High**          | 🔮 Future      | 900% faster than canvas (per xterm.js)                       |
| React Native | **High**          | 🔮 Future      | FlatList pain is real, Litho/ComponentKit prove the approach |
| PDF/Email    | **Medium**        | 🔮 Future      | Niche but useful for reports                                 |

## Terminal (Complete)

The foundation — production-ready with all planned features implemented.

**Core**: Terminal buffer, ANSI output with diffing, keyboard input, [Flexily](https://github.com/beorn/flexily) layout engine (2.5x faster than Yoga, zero WASM), `overflow="scroll"`, Unicode/emoji/CJK handling, style layering.

**Enhanced**: React DevTools (`connectDevTools()`), Cursor API (TextArea, TextInput with real terminal cursor), Kitty keyboard protocol (auto-detected), SGR mouse (click/hover/drag), Image protocols (Sixel + Kitty).

## Web Targets (Canvas, DOM, WebGL)

Canvas and DOM adapters are implemented, validating the multi-target architecture.

| Adapter   | Status      | Entry Point      |
| --------- | ----------- | ---------------- |
| Canvas 2D | ✅ Complete | `silvery/canvas` |
| DOM       | ✅ Complete | `silvery/dom`    |
| WebGL     | 🔮 Future   | —                |

```tsx
// Canvas rendering
import { renderToCanvas, Box, Text } from "@silvery/term/canvas"
renderToCanvas(<App />, canvas, { fontSize: 14 })

// DOM rendering (accessible, text-selectable)
import { renderToDOM, Box, Text } from "@silvery/term/dom"
renderToDOM(<App />, container, { fontSize: 14 })
```

**Why this matters**: Web developers solve layout-dependent rendering with the "ResizeObserver dance" — `useRef` + `ResizeObserver` + `useEffect` + a blank first render. Silvery's `useContentRect()` gives components their dimensions during render, not after. This is high value for canvas games, data visualization, design tools, and dashboards where CSS layout doesn't apply.

**Renderer tradeoffs** (per [xterm.js research](https://github.com/xtermjs/xterm.js/issues/3271)):

| Renderer | Performance        | Text Selection | Accessibility |
| -------- | ------------------ | -------------- | ------------- |
| WebGL    | Best (900% faster) | ❌             | ❌            |
| Canvas   | Good               | ❌             | ❌            |
| DOM      | Slowest            | ✅             | ✅            |

**Reuse from core**: Reconciler (100%), layout engine (100%), `useContentRect` (100%), style system (partial — no underlines, needs color mapping). ~30% of the codebase is directly reusable across targets.

## React Native

The **highest-impact** future target. React Native's biggest pain point is virtualized lists — `FlatList` requires height estimation, and variable-height items cause scroll jank. Shopify's FlashList improves recycling but still needs height estimates.

Silvery's two-phase pattern solves this: layout is calculated in JS before rendering, so scroll position comes from actual heights — no estimation, no jank. Facebook's Litho (Android) and ComponentKit (iOS) already proved this approach works (~35% scroll performance improvement).

**Best path**: Investigate React Native's Fabric architecture, which has synchronous layout capabilities that could enable Silvery's pattern without a full reconciler replacement.

## Beyond React

Silvery's architecture separates the component model from rendering targets through the `RenderAdapter` interface. While React is the current (and only) reconciler, the two-phase pattern — compute layout first, then render — is framework-agnostic.

The core insight is that layout should be synchronous and available during render, not computed asynchronously after. This applies regardless of whether the component model is React, [Svelte](https://svelte.dev/), [Vue](https://vuejs.org/), [Solid](https://www.solidjs.com/), or something else entirely.

Potential directions:
- **Svelte adapter** — Svelte's compile-time approach could eliminate reconciler overhead entirely
- **Solid adapter** — Fine-grained reactivity + synchronous layout is a natural fit
- **Framework-agnostic core** — Extract layout + buffer + diffing as a standalone library that any framework can target

This is exploratory. React support is the priority, and the architecture is designed so that adding new component models doesn't require changing the rendering pipeline.

## Specialized Targets

| Target | Use Case          | Feasibility | Notes                          |
| ------ | ----------------- | ----------- | ------------------------------ |
| PDF    | Reports, invoices | Medium      | Layout engine + PDF primitives |
| Email  | HTML email        | Medium      | Generate inline-styled HTML    |
| AR/VR  | Spatial UI        | Research    | 3D layout is a different problem |

## Plugin Composition

Status tracking for the plugin system described in the [Building an App](guides/building-an-app.md) guide.

| Feature                                       | Status      |
| --------------------------------------------- | ----------- |
| Individual plugins (withDomEvents, etc.)       | ✅ Implemented |
| createApp() + centralized key handler          | ✅ Implemented |
| Unified pipe() composition                     | Planned     |
| Typed dispatch proxy                           | Planned     |
| app.subscribe() with selector reactions        | Planned     |
| Plugin-scoped cleanup via DisposableStack      | Planned     |
| Effect combinators (debounce, throttle, delay) | Planned     |

## See Also

- [architecture.md](deep-dives/architecture.md) — Core architecture and RenderAdapter interface
- [design.md](design/design.md) — Terminal implementation details
- [performance.md](deep-dives/performance.md) — Performance characteristics
