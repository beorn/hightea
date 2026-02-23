---
title: Live Demo — Three Render Targets
description: The same inkx component rendered to Canvas, DOM, and Terminal simultaneously
---

# Live Demo

The same React component rendered to three different targets -- demonstrating inkx's pluggable RenderAdapter architecture.

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

<LiveDemo />

## How It Works

inkx's `RenderAdapter` interface abstracts the rendering target. The same component tree runs through the same layout engine (Flexx) and render pipeline. Only the final output differs:

| Target | Adapter | Output |
|--------|---------|--------|
| **Canvas 2D** | `renderToCanvas()` | Draws glyphs to an OffscreenCanvas, composited onto a visible `<canvas>` element |
| **DOM** | `renderToDOM()` | Creates semantic `<span>` and `<div>` elements with CSS styling |
| **Terminal** | `renderToXterm()` | Writes ANSI escape sequences to an xterm.js terminal emulator |

### The Same Component

All three tabs run identical React code:

```tsx
import { Box, Text, useContentRect } from 'inkx'

function App() {
  const { width, height } = useContentRect()
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="cyan" padding={1}>
        <Text bold color="cyan">inkx Rendering</Text>
        <Text color="green">Size: {width} x {height}</Text>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Box backgroundColor="red" padding={1}>
          <Text color="white">Red</Text>
        </Box>
        <Box backgroundColor="green" padding={1}>
          <Text color="black">Green</Text>
        </Box>
        <Box backgroundColor="blue" padding={1}>
          <Text color="white">Blue</Text>
        </Box>
      </Box>
    </Box>
  )
}
```

### Why Three Targets?

- **Canvas** -- best for pixel-perfect rendering, image export, and WebGL upgrade path
- **DOM** -- best for accessibility, text selection, and CSS integration
- **Terminal** -- proves that the same components work identically in a real terminal

The adapter pattern means your components are portable. Write once, render to any target -- including targets that don't exist yet.

## Building the Examples

To run the demos locally:

```bash
cd vendor/beorn-inkx
bun run examples/web/build.ts
```

This builds the JavaScript bundles into `examples/web/dist/`. The HTML pages load these bundles and render the demo applications.
