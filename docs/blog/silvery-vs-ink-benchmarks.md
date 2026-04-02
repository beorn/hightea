---
title: "Silvery vs Ink: An Honest Benchmark"
description: "Head-to-head performance comparison with methodology, numbers, and honest analysis of where each framework wins."
date: 2026-04-02
---

# Silvery vs Ink: An Honest Benchmark

Performance comparisons between frameworks tend to cherry-pick the numbers that look good. I want to do this differently -- show all the numbers, explain the methodology, and be upfront about where Ink is faster.

Both Silvery and Ink are good tools. The performance characteristics are different because the architectures are different, and which tradeoff matters depends on what you're building.

## Methodology

All benchmarks run on the same machine under the same conditions:

- **Hardware**: Apple M1 Max, 64 GB RAM
- **Runtime**: Bun 1.3.9
- **Measured with**: `performance.now()` for wall clock, median of 100 runs after 10 warmup iterations
- **Ink version**: 6.2.0 (Yoga WASM v3)
- **Silvery version**: 0.5.x (Flexily layout engine)
- **Date**: February 2026

You can reproduce everything with `bun run bench:compare` in the Silvery repo. The benchmark suite is in `tests/perf/` and runs both frameworks side by side with identical component trees.

## The Numbers

### Cold Render (First Paint)

How long it takes to render a component tree for the first time.

| Scenario        | Silvery | Ink    | Winner         |
| --------------- | ------- | ------ | -------------- |
| 1 component     | 165 us  | 271 us | Silvery (1.6x) |
| 10 components   | 1.2 ms  | 1.8 ms | Silvery (1.5x) |
| 100 components  | 18 ms   | 24 ms  | Silvery (1.3x) |
| 1000 components | 463 ms  | 541 ms | Silvery (1.2x) |

Silvery is consistently faster on cold renders, but the margin narrows as tree size grows. The difference comes from Flexily (pure TypeScript) vs Yoga (WASM) -- Flexily avoids the WASM boundary crossing overhead, and its fingerprint-based caching kicks in when subtrees have identical shapes.

### Full React Re-render

What happens when the entire React tree is replaced -- a new root element causing a full reconciliation.

| Scenario        | Silvery | Ink     | Winner    |
| --------------- | ------- | ------- | --------- |
| 1000 components | 630 ms  | 20.7 ms | Ink (30x) |

**Ink wins here, decisively.** This is worth explaining.

Silvery's rendering pipeline has five phases: React reconciliation, layout, render (content generation), buffer compositing, and output diffing. Each phase has its own caching and dirty-tracking infrastructure. When the entire tree is replaced, all of that infrastructure has to rebuild -- cache entries invalidated, dirty flags reset, content regenerated for every node.

Ink's architecture is simpler: React renders, Yoga layouts, strings concatenate, lines diff. With fewer layers, there's less to rebuild.

### Typical Interactive Update

What happens when a user presses a key in a running application -- the scenario that matters most for perceived responsiveness.

| Scenario                | Silvery | Ink     | Winner         |
| ----------------------- | ------- | ------- | -------------- |
| Single node text change | 169 us  | 20.7 ms | Silvery (122x) |
| Cursor movement in list | 184 us  | 20.7 ms | Silvery (112x) |
| Scroll position change  | 201 us  | 20.7 ms | Silvery (103x) |

**Silvery wins here, decisively.** This is where the five-phase pipeline pays off.

When a user presses `j` to move down in a list, Silvery knows exactly which nodes changed. React reconciliation runs only for the affected subtree. Layout is skipped entirely (node sizes haven't changed). Content generation runs only for the two items that changed (old selection and new selection). Buffer compositing diffs only the changed cells. The output phase emits ANSI escapes for only those cells.

Ink re-renders the entire React tree, runs full Yoga layout, regenerates all strings, and diffs the output line by line. Every line that contains a changed character is rewritten entirely.

The 20.7ms figure is for Ink's full-tree re-render -- which is what happens on any state change. Ink's line-based diff (opt-in since v6.5.0) can skip unchanged lines in the output phase, but the React and Yoga phases still run for the full tree.

### Layout Performance

| Scenario                      | Silvery (Flexily) | Ink (Yoga WASM) | Winner         |
| ----------------------------- | ----------------- | --------------- | -------------- |
| 50-node kanban board          | 57 us             | 88 us           | Flexily (1.5x) |
| Cached re-layout (no changes) | 3 us              | 88 us           | Flexily (29x)  |
| Terminal resize (1000 nodes)  | 21 us             | Full re-render  | --             |

Flexily's fingerprinting cache is the big differentiator here. When a subtree hasn't changed shape, Flexily reuses the cached layout result. Yoga recomputes from scratch every time.

### Buffer Operations

| Scenario                          | Silvery | Ink | Winner |
| --------------------------------- | ------- | --- | ------ |
| Buffer diff (80x24, 10% changed)  | 34 us   | N/A | --     |
| Buffer diff (200x50, 10% changed) | 112 us  | N/A | --     |

Ink doesn't have a cell-level buffer -- it works with strings and diffs at the line level. These numbers aren't directly comparable, but they show that Silvery's buffer diff is fast enough to be negligible.

## When Does This Matter?

For a CLI tool that renders once and exits -- like a pretty-printed JSON output or a one-time status display -- none of this matters. Both frameworks render fast enough that you won't notice a difference.

For interactive applications, the difference is real:

**At 60 FPS (16.7ms frame budget):**

- Silvery's 169us update leaves 16.5ms for application logic -- 98.9% of the frame budget.
- Ink's 20.7ms update already exceeds the frame budget before any application logic runs.

**For streaming data (LLM token output, log tailing, live metrics):**

- At 50 updates per second, Silvery spends 8.5ms total on rendering. Smooth.
- At 50 updates per second, Ink spends 1035ms total on rendering. Visible lag.

**For complex layouts (kanban boards, multi-pane editors, dashboards):**

- Silvery's cached layout means adding more panels doesn't slow down interaction.
- Ink's full-tree layout runs on every state change regardless of what changed.

## The Tradeoff

Silvery's architecture optimizes for the common case (small incremental updates) at the cost of the uncommon case (full tree replacement). The five-phase pipeline with per-node dirty tracking is more complex than Ink's straightforward render-layout-diff pipeline. That complexity means:

- **More memory per node** -- dirty flags, cache entries, content buffers
- **Slower full rebuilds** -- when everything changes, the overhead of checking what changed costs more than just redoing everything
- **Larger framework size** -- more code to load and JIT

Ink's architecture is simpler, which means it's easier to reason about performance characteristics. If your app occasionally replaces its entire tree (switching between very different views), Ink handles that transition faster.

## Memory

One difference worth noting: Flexily uses normal JavaScript garbage collection. Yoga uses a WASM linear memory heap that [can grow over long-running sessions](https://github.com/anthropics/claude-code/issues/4953). For short-lived CLI tools this doesn't matter. For applications that run for hours (dashboards, editors, chat interfaces), it can.

## My Take

Both frameworks are fast enough for most applications. If you're building a CLI tool that shows a spinner and some formatted output, use whichever API you prefer.

If you're building something interactive -- where users are pressing keys, scrolling through data, or watching streaming output -- the 100x difference in interactive update latency is noticeable and worth considering.

The detailed comparison page at [silvery.dev/guide/silvery-vs-ink](/guide/silvery-vs-ink) covers the full feature comparison beyond performance: responsive layout, scrollable containers, mouse support, focus management, and the rest. Performance is one factor among many.
