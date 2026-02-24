---
layout: home

hero:
  name: "inkx"
  text: "React for modern terminals"
  tagline: "Layout feedback, every terminal protocol, React + Elm architectures, 122x faster updates. Zero native dependencies."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/inkx

features:
  - icon: "\U0001F4D0"
    title: Layout Feedback
    details: "Components query their own dimensions via useContentRect(). No width prop drilling. Ink's oldest open issue (2016), solved."
  - icon: "\U0001F4E1"
    title: Every Protocol
    details: "Kitty keyboard, SGR mouse, images, clipboard, hyperlinks, synchronized updates. All built-in, all auto-detected."
  - icon: "\u26A1"
    title: 122x Faster*
    details: "Per-node dirty tracking with 7 independent flags -- 169us vs Ink's 20.7ms. Only changed nodes re-render."
    link: /guide/why-inkx#incremental-rendering
    linkText: "* See benchmarks"
  - icon: "\U0001F9E9"
    title: Three Architectures
    details: "Elm-style reducers, React hooks, or Zustand stores. Choose the right paradigm per use case -- all three in one framework."
  - icon: "\U0001F4E6"
    title: 23+ Components
    details: "Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more. Scrollable containers just work."
  - icon: "\U0001F916"
    title: Built for AI
    details: "Command introspection for agents, programmatic screenshots, scrollable streaming output. CLAUDE.md ships with the package."
  - icon: "\U0001F5C4\uFE0F"
    title: Scrollable Containers
    details: "overflow=\"scroll\" with scrollTo just works. No manual virtualization. Ink's #1 feature request since 2019, solved."
  - icon: "\U0001F6AB"
    title: Zero Dependencies
    details: "Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno."
---

<script setup>
import LiveDemo from './.vitepress/components/LiveDemo.vue'
</script>

## See It in Action

Real inkx components, running live in the browser via xterm.js:

<LiveDemo xtermSrc="/inkx/examples/showcase.html?demo=dashboard" :height="400" />

## Build Any Terminal App

<div class="use-cases">

- **[AI Assistants & Chat](/use-cases/ai-assistants)** -- Streaming output, scrollback history, command palettes
- **[Dashboards & Monitoring](/use-cases/dashboards)** -- Multi-pane layouts with real-time data
- **[Kanban & Project Boards](/use-cases/kanban-boards)** -- Multi-column navigation with cards and focus management
- **[CLI Wizards & Setup Tools](/use-cases/cli-wizards)** -- Step-by-step forms, selections, progress tracking
- **[Developer Tools](/use-cases/developer-tools)** -- REPLs, log viewers, debuggers, profilers
- **[Data Explorers & Tables](/use-cases/data-explorers)** -- Virtual lists, filtering, search, sortable tables

</div>

## What's Inside

<div class="features-list">

- **23+ components** -- Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more
- **Scrollable containers** -- `overflow="scroll"` with `scrollTo` just works. No manual virtualization. Ink's #1 feature request since 2019.
- **Three architectures** -- React hooks, Elm-style reducers, or Zustand stores. Choose per use case -- all three in one framework.
- **Built for AI** -- Command introspection for agents, programmatic screenshots, scrollable streaming output. CLAUDE.md ships with the package.
- **Input system** -- Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, command system with keybinding resolution
- **Zero native deps** -- Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno.

</div>

## Quick Start

```bash
bun add inkx react @beorn/flexx
```

```tsx
import { Box, Text, useContentRect } from "inkx"
import { run, useInput } from "inkx/runtime"

function App() {
  const { width } = useContentRect() // Components know their size!
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

<style>
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
.features-list {
  margin: 0.5rem 0 1.5rem;
}
.features-list li {
  margin: 0.35rem 0;
  line-height: 1.5;
}
</style>
