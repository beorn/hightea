---
title: "Build a CLI Dashboard in 50 Lines"
description: "Step-by-step tutorial building a real-time system dashboard in the terminal with Silvery. Responsive layout, live data, and theming."
date: 2026-04-02
---

# Build a CLI Dashboard in 50 Lines

Terminal dashboards are one of those projects that sound simple until you start building one. You need columns that resize with the terminal, live-updating numbers, and ideally some visual structure so it doesn't look like a wall of text. With most terminal frameworks, you end up spending more time on layout plumbing than on the actual data you want to display.

I built a system monitor dashboard with Silvery in about 50 lines. Here's how it works, step by step.

## Start With Static Data

The simplest dashboard is just boxes with text. Silvery uses flexbox for layout -- the same model as CSS -- so if you've done web development, the mental model transfers directly.

```tsx
import { render, Box, Text } from "silvery"

function Dashboard() {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box borderStyle="round" paddingX={1}>
        <Text bold color="$primary">
          System Monitor
        </Text>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexGrow={1} borderStyle="single" paddingX={1} flexDirection="column">
          <Text bold>CPU</Text>
          <Text>Usage: 45%</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single" paddingX={1} flexDirection="column">
          <Text bold>Memory</Text>
          <Text>Usage: 8.2 / 16.0 GB</Text>
        </Box>
      </Box>
    </Box>
  )
}

await render(<Dashboard />).run()
```

Two things to notice: `flexGrow={1}` makes each panel fill its share of the available space, and `flexDirection="row"` puts them side by side. The border styles give each panel a visible boundary. The `$primary` color token means the title will adapt to whatever theme is active -- Dracula, Nord, Solarized, whatever the user's terminal is running.

## Make It Responsive

A two-column layout works on a wide terminal but is cramped at 60 columns. Silvery lets components query their own dimensions during render with `useContentRect()`:

```tsx
import { render, Box, Text, useContentRect } from "silvery"

function Panels({ children }: { children: React.ReactNode }) {
  const { width } = useContentRect()
  return (
    <Box flexDirection={width < 60 ? "column" : "row"} flexGrow={1}>
      {children}
    </Box>
  )
}

function Dashboard() {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box borderStyle="round" paddingX={1}>
        <Text bold color="$primary">
          System Monitor
        </Text>
      </Box>
      <Panels>
        <Panel title="CPU" value="45%" />
        <Panel title="Memory" value="8.2 / 16.0 GB" />
        <Panel title="Network" value="↓ 2.4 MB/s  ↑ 0.8 MB/s" />
      </Panels>
    </Box>
  )
}
```

This is the equivalent of CSS container queries -- the `Panels` component switches between row and column layout based on its own width, not the terminal width. If the component is inside a split view or a sidebar, it still does the right thing.

In Ink, this isn't possible during render. You'd need a `useEffect` + `measureElement` cycle that causes a visible flicker on first paint. Silvery runs layout before render, so `useContentRect()` has real values on the first render pass.

## Add Live Data

React's `useState` and `useEffect` work exactly as you'd expect. Here's a `useLiveData` hook that updates every second:

```tsx
import { useState, useEffect } from "react"
import { cpus, freemem, totalmem } from "node:os"

function useLiveData() {
  const [stats, setStats] = useState(getStats)

  useEffect(() => {
    const id = setInterval(() => setStats(getStats()), 1000)
    return () => clearInterval(id)
  }, [])

  return stats
}

function getStats() {
  const cpuUsage =
    cpus().reduce((sum, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      return sum + (1 - cpu.times.idle / total)
    }, 0) / cpus().length

  return {
    cpu: Math.round(cpuUsage * 100),
    memUsed: ((totalmem() - freemem()) / 1e9).toFixed(1),
    memTotal: (totalmem() / 1e9).toFixed(1),
  }
}
```

When `setStats` fires, Silvery's incremental renderer only updates the text nodes that changed. If CPU goes from 45% to 46%, only that one `<Text>` node re-renders -- not the borders, not the other panels, not the title. On a typical update, that's about 169 microseconds of work.

## Add a Progress Bar

Silvery ships a `ProgressBar` component that automatically sizes itself to fill available width:

```tsx
import { ProgressBar } from "silvery"

function Panel({ title, value, bar }: { title: string; value: string; bar?: number }) {
  return (
    <Box flexGrow={1} borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>{title}</Text>
      <Text color="$muted">{value}</Text>
      {bar !== undefined && <ProgressBar value={bar} />}
    </Box>
  )
}
```

The `ProgressBar` uses `useContentRect` internally, so it fills whatever space its parent gives it. No width prop needed.

## The Full 50-Line Version

Here's the complete dashboard. It shows CPU, memory, and uptime, with responsive layout and live updates:

```tsx
import { render, Box, Text, ProgressBar, useContentRect } from "silvery"
import { useState, useEffect } from "react"
import { cpus, freemem, totalmem, uptime } from "node:os"

function getStats() {
  const cpuUsage =
    cpus().reduce((sum, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      return sum + (1 - cpu.times.idle / total)
    }, 0) / cpus().length
  const memUsed = (totalmem() - freemem()) / 1e9
  const memTotal = totalmem() / 1e9
  const hrs = Math.floor(uptime() / 3600)
  const mins = Math.floor((uptime() % 3600) / 60)
  return { cpu: cpuUsage, memUsed, memTotal, uptime: `${hrs}h ${mins}m` }
}

function Panel({ title, value, bar }: { title: string; value: string; bar?: number }) {
  return (
    <Box flexGrow={1} borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>{title}</Text>
      <Text color="$muted">{value}</Text>
      {bar !== undefined && <ProgressBar value={bar} />}
    </Box>
  )
}

function Dashboard() {
  const [stats, setStats] = useState(getStats)
  const { width } = useContentRect()
  useEffect(() => {
    const id = setInterval(() => setStats(getStats()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box borderStyle="round" paddingX={1} justifyContent="space-between">
        <Text bold color="$primary">
          System Monitor
        </Text>
        <Text color="$muted">Uptime: {stats.uptime}</Text>
      </Box>
      <Box flexDirection={width < 60 ? "column" : "row"} flexGrow={1}>
        <Panel title="CPU" value={`${Math.round(stats.cpu * 100)}%`} bar={stats.cpu} />
        <Panel
          title="Memory"
          value={`${stats.memUsed.toFixed(1)} / ${stats.memTotal.toFixed(1)} GB`}
          bar={stats.memUsed / stats.memTotal}
        />
        <Panel title="CPUs" value={`${cpus().length} cores`} />
      </Box>
    </Box>
  )
}

await render(<Dashboard />).run()
```

That's a responsive, live-updating, themed system dashboard. The `$primary` and `$muted` color tokens adapt to the user's terminal theme automatically. The layout flips from three columns to a single column on narrow terminals. The progress bars size themselves to fit.

## What I'd Add Next

This is a starting point. Some directions to take it:

- **More panels**: disk usage, network I/O, process list. Each panel is just another `<Panel>` component in the flex container.
- **Keyboard navigation**: wrap the panels in a `SelectList` or add `focusScope` on each Box to make them selectable with arrow keys.
- **Alerts**: use `<Badge variant="error">` or `<Toast>` when CPU exceeds a threshold.
- **Historical data**: render a sparkline or chart using Unicode block characters inside a Text node.

The point is that all the layout and rendering infrastructure is handled. You spend your time on what data to show and how to present it, not on calculating column widths or diffing terminal buffers.
