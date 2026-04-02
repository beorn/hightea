---
title: "Layout-First Rendering: Why Terminal Components Need Their Width"
description: "The architectural decision behind Silvery's rendering pipeline -- what problem it solves and how it works."
date: 2026-04-02
---

# Layout-First Rendering: Why Terminal Components Need Their Width

I was building a kanban board in the terminal. Three columns on a wide terminal, two on narrow, one on very narrow. Each column needed to truncate card titles to fit. Each card needed to know how wide it was to decide between a compact and full layout.

In Ink, this wasn't possible. The column component couldn't know its width during render.

## The Standard Pipeline

Every React terminal renderer I've seen follows the same pipeline:

1. **React renders** -- components produce a virtual tree
2. **Layout engine runs** -- Yoga computes positions and sizes
3. **Output** -- the renderer writes characters to the terminal

The problem is step 1. When React calls your component function, layout hasn't happened yet. Your component doesn't know how wide it is. It doesn't know how tall its parent is. It renders blind and hopes for the best.

```tsx
// Ink: how wide am I? Nobody knows yet.
function Card({ item }: { item: Item }) {
  // Can't truncate title -- don't know the width
  // Can't choose compact layout -- don't know the height
  // Can't hide secondary text -- don't know if there's room
  return (
    <Box>
      <Text>{item.title}</Text>
      <Text>{item.description}</Text>
    </Box>
  )
}
```

Ink added `measureElement()` in response to this problem. It works like the browser's `ResizeObserver` -- you can read dimensions after render:

```tsx
// Ink: measure after render, then re-render
function Card({ item }: { item: Item }) {
  const ref = useRef()
  const [width, setWidth] = useState(0)

  useEffect(() => {
    setWidth(measureElement(ref.current).width)
  })

  return (
    <Box ref={ref}>
      <Text>{width > 0 ? truncate(item.title, width) : item.title}</Text>
    </Box>
  )
}
```

This works, but it has problems. The component renders twice visibly -- first with `width=0`, then with the real width. With nested responsive components (board -> column -> card), each level needs its own measure-rerender cycle. Three levels of nesting means three visible flickers cascading through the tree.

This has been a [known limitation since 2016](https://github.com/vadimdemedes/ink/issues/5). It's not a bug in Ink -- it's a consequence of the render-first pipeline.

## Inverting the Pipeline

Silvery inverts steps 1 and 2:

1. **Layout engine runs** -- Flexily computes positions and sizes
2. **React renders** -- components produce content _with dimensions available_
3. **Output** -- the renderer writes characters to the terminal

Wait, how can layout run before React? Layout needs to know the sizes of things. React generates the things. It seems circular.

The key insight is that **layout doesn't need content**. Layout needs _structure_ -- which nodes exist, what flex properties they have, what their min/max sizes are. Silvery tracks this structure separately from content. When a component mounts, its structural properties (flex direction, padding, borders, min/max sizes) are known from JSX props. Layout can compute the entire tree's geometry from just the structural skeleton.

Then when React renders each component, the component can read its computed dimensions:

```tsx
// Silvery: dimensions are known during render
function Card({ item }: { item: Item }) {
  const { width, height } = useContentRect()

  return (
    <Box>
      <Text>{truncate(item.title, width - 4)}</Text>
      {height > 3 && <Text color="$muted">{item.description}</Text>}
    </Box>
  )
}
```

No effect. No re-render. No flicker. `useContentRect()` returns real values on the first render pass because layout has already computed them.

## What This Enables

### Responsive Components

Components can adapt to their container, not just the viewport:

```tsx
function Panel() {
  const { width } = useContentRect()

  if (width < 20) return <CompactView />
  if (width < 40) return <MediumView />
  return <FullView />
}
```

This is the terminal equivalent of CSS container queries. The component doesn't care whether it's full-screen or inside a split view -- it adapts to whatever space it's given.

### Automatic Text Truncation

Silvery knows the width of every Box during render. Text that exceeds its container's width is truncated automatically with ANSI-aware clipping. You don't need to manually measure and truncate -- though you can if you want precise control.

### Scrollable Containers

`overflow="scroll"` works because the framework knows how tall the container is and how tall the children are:

```tsx
<Box overflow="scroll" height={20}>
  {items.map((item) => (
    <Item key={item.id} data={item} />
  ))}
</Box>
```

Silvery measures all children, determines which are visible in the 20-row viewport, and renders only those. Variable-height children work automatically -- no `estimateHeight` function needed.

In a render-first pipeline, you can't implement this natively. The container doesn't know its height during render, and the children don't know theirs. That's why Ink requires manual virtualization with height estimation.

### The Kanban Board

Back to the original problem. Here's the kanban board with responsive columns:

```tsx
function Board({ columns }: { columns: Column[] }) {
  const { width } = useContentRect()
  const visibleCols = width < 60 ? 1 : width < 120 ? 2 : 3
  const displayed = columns.slice(0, visibleCols)

  return (
    <Box flexDirection="row" width="100%">
      {displayed.map((col) => (
        <Box key={col.id} flexGrow={1} flexDirection="column" borderStyle="single">
          <Text bold>{col.title}</Text>
          <Box overflow="scroll" flexGrow={1}>
            {col.cards.map((card) => (
              <CardView key={card.id} card={card} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function CardView({ card }: { card: Card }) {
  const { width } = useContentRect()
  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold>{truncate(card.title, width - 2)}</Text>
      {width > 30 && <Text color="$muted">{card.assignee}</Text>}
    </Box>
  )
}
```

The Board shows 1-3 columns based on its width. Each column scrolls its cards. Each card truncates its title to fit and shows/hides the assignee based on available space. All responsive. No prop drilling. No measurement effects. No flicker.

## The Tradeoff

There's a cost to this architecture. Silvery's pipeline is more complex than Ink's. The five phases (layout, React render, content generation, buffer compositing, output diffing) have more moving parts. Each phase has its own caching and dirty-tracking infrastructure.

This complexity shows up in one specific scenario: **full tree replacement**. When you replace the root element with something completely different -- switching from a settings screen to a chat view, for example -- Silvery is about 30x slower than Ink. All the caching infrastructure needs to rebuild from scratch, and the overhead of checking what changed costs more than Ink's approach of just redoing everything.

For incremental updates (pressing a key, scrolling, typing), Silvery is about 100x faster. Most of the pipeline is skipped because the caching knows exactly what changed.

Whether this tradeoff makes sense depends on your application. If you're building something that frequently replaces its entire tree, Ink's simpler architecture is an advantage. If you're building something interactive where users are pressing keys and scrolling through data, the incremental path is what matters.

## The Web Parallel

The web went through a similar evolution. For years, components couldn't know their container's size during render. They used `window.innerWidth` or `ResizeObserver` with post-render measurement -- the same pattern Ink uses. CSS container queries (`@container`) finally solved this in 2023 by making container dimensions available during the render/style calculation phase.

`useContentRect()` is the terminal equivalent of container queries. Components adapt to their container, not the viewport. The answer is available during render, not after. And it works without any special wiring -- just call the hook.

The underlying principle is the same: **components need to know their constraints to make good rendering decisions**. Whether it's a kanban column choosing how many cards to show, a text field deciding where to truncate, or a dashboard switching between compact and full layouts -- the answer is always "it depends on how much space I have."

A pipeline that provides that information during render, rather than after, eliminates an entire category of workarounds.
