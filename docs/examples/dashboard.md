---
prev:
  text: Live Demo
  link: /examples/live-demo
next:
  text: Task List
  link: /examples/task-list
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Dashboard Example

A multi-pane system monitor demonstrating flexbox layouts, tab navigation, and live-updating data.

[[toc]]

## Live Demo

<LiveDemo xtermSrc="/examples/showcase.html?demo=dashboard" :height="500" />

## What It Demonstrates

- **Flexbox layouts** — proportional sizing with `flexGrow`, spacing with `gap` and `justifyContent`
- **Tab navigation** — left/right arrows switch between panels
- **Progress bars** — `flexGrow` sized proportionally to values (no manual width math)
- **Scrollable list** — `overflow="scroll"` with `scrollTo` for keyboard navigation

## Running the Example

```bash
cd silvery
bun run examples/layout/dashboard.tsx
```

## Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useInput, useApp, createTerm } from "silvery"
import { useState } from "react"

// Sample data
const stats = [
  { label: "CPU", value: 45 },
  { label: "Memory", value: 62 },
  { label: "Disk", value: 28 },
  { label: "Network", value: 15 },
]

const activities = [
  { time: "12:01", message: "User logged in" },
  { time: "12:00", message: "Build passed" },
  { time: "11:58", message: "PR #42 merged" },
  { time: "11:55", message: "Deploy completed" },
  { time: "11:50", message: "Tests started" },
  { time: "11:45", message: "Branch created" },
  { time: "11:40", message: "Issue assigned" },
]

const recentItems = [
  { name: "project-alpha", date: "2 hours ago" },
  { name: "report-q4.pdf", date: "Yesterday" },
  { name: "config.json", date: "3 days ago" },
  { name: "notes.md", date: "Last week" },
  { name: "package.json", date: "2 weeks ago" },
  { name: "README.md", date: "Last month" },
]

const tabs = ["Stats", "Activity", "Recent"] as const

function App() {
  const { exit } = useApp()
  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (input === "q" || key.escape) exit()
    if (key.leftArrow) setTab((t) => Math.max(0, t - 1))
    if (key.rightArrow) setTab((t) => Math.min(tabs.length - 1, t + 1))
    if (tab === 2) {
      if (key.downArrow) setSelected((s) => Math.min(s + 1, recentItems.length - 1))
      if (key.upArrow) setSelected((s) => Math.max(s - 1, 0))
    }
  })

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TabBar active={tab} />
      <Box flexGrow={1} borderStyle="single" paddingX={1} paddingTop={1}>
        {tab === 0 && <StatsPane />}
        {tab === 1 && <ActivityPane />}
        {tab === 2 && <RecentPane selected={selected} />}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>←→ tabs{tab === 2 ? "  ↑↓ select" : ""} q quit</Text>
      </Box>
    </Box>
  )
}

function TabBar({ active }: { active: number }) {
  return (
    <Box flexDirection="row" gap={1} paddingX={1} marginBottom={0}>
      {tabs.map((label, i) => (
        <Text key={label} bold={i === active} inverse={i === active}>
          {" "}
          {label}{" "}
        </Text>
      ))}
    </Box>
  )
}

function StatsPane() {
  return (
    <Box flexDirection="column" gap={1}>
      {stats.map((stat) => (
        <Box key={stat.label} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>{stat.label}</Text>
            <Text bold>{stat.value}%</Text>
          </Box>
          <ProgressBar value={stat.value} />
        </Box>
      ))}
    </Box>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <Box flexDirection="row">
      <Box flexGrow={value}>
        <Text color="green">{"█".repeat(50)}</Text>
      </Box>
      <Box flexGrow={100 - value}>
        <Text dimColor>{"░".repeat(50)}</Text>
      </Box>
    </Box>
  )
}

function ActivityPane() {
  return (
    <Box flexDirection="column">
      {activities.map((activity, i) => (
        <Box key={i} flexDirection="row" gap={1}>
          <Text dimColor>{activity.time}</Text>
          <Text>{activity.message}</Text>
        </Box>
      ))}
    </Box>
  )
}

function RecentPane({ selected }: { selected: number }) {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={selected}>
      {recentItems.map((item, i) => (
        <Box key={item.name} flexDirection="row" justifyContent="space-between">
          <Text inverse={i === selected}>
            {i === selected ? "> " : "  "}
            {item.name}
          </Text>
          <Text dimColor>{item.date}</Text>
        </Box>
      ))}
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Key Patterns

### Flex Progress Bars

Instead of manually calculating bar widths with `useContentRect()`, use `flexGrow` proportionally:

```tsx
function ProgressBar({ value }: { value: number }) {
  return (
    <Box flexDirection="row">
      <Box flexGrow={value}>
        <Text color="green">{"█".repeat(50)}</Text>
      </Box>
      <Box flexGrow={100 - value}>
        <Text dimColor>{"░".repeat(50)}</Text>
      </Box>
    </Box>
  )
}
```

The text is longer than the box — Silvery truncates it. `flexGrow` handles the proportions. No width math.

### Flex Spacing

Use `justifyContent="space-between"` instead of manual padding calculations:

```tsx
<Box flexDirection="row" justifyContent="space-between">
  <Text>{stat.label}</Text>
  <Text bold>{stat.value}%</Text>
</Box>
```

### Tab Navigation

Tabs give keyboard interaction meaning — each view has different content and controls:

```tsx
const [tab, setTab] = useState(0)
useInput((input, key) => {
  if (key.leftArrow) setTab((t) => Math.max(0, t - 1))
  if (key.rightArrow) setTab((t) => Math.min(tabs.length - 1, t + 1))
})
```

## Key Silvery Features Used

| Feature             | Usage                                       |
| ------------------- | ------------------------------------------- |
| `flexGrow`          | Proportional progress bars and panel sizing |
| `justifyContent`    | Spacing between labels and values           |
| `gap`               | Consistent spacing between items            |
| `overflow="scroll"` | Scrollable recent items list                |
| `scrollTo={index}`  | Keep selected item visible                  |
| `useInput()`        | Tab switching and list navigation           |

### Why Silvery for Dashboards

- **Real-time updates** — Silvery's incremental renderer tracks dirty flags per node. When one metric changes, only that cell repaints — 169μs per update vs 20.7ms for a full re-render. Smooth 30fps data refreshes.

- **Theming** — `ThemeProvider` with semantic `$token` colors gives your dashboard a consistent look.

- **Synchronized output** — DEC 2026 synchronized updates wrap each frame in atomic begin/end markers, eliminating partial-repaint flicker.

## Exercises

1. **Add a fourth tab** — Show a "Notifications" panel with badge counts
2. **Color-code progress bars** — Red/yellow/green based on value thresholds
3. **Live updates** — Use `useEffect` + `setInterval` to animate stat values
4. **Responsive tabs** — Stack tabs vertically on narrow terminals using `useContentRect()`
