# hightea vs Ink Performance Benchmark Suite

Head-to-head performance comparison between hightea and Ink 6.

## Setup

Ink is installed in this directory only (not a dependency of hightea):

```bash
cd vendor/hightea/benchmarks/ink-comparison && bun install
```

## Running

```bash
cd /Users/beorn/Code/pim/km

# Head-to-head comparison (runs both suites, prints comparison table)
bun run vendor/hightea/benchmarks/ink-comparison/compare.ts

# Individual suites
bun run vendor/hightea/benchmarks/ink-comparison/run.ts       # hightea only
bun run vendor/hightea/benchmarks/ink-comparison/ink-bench.ts  # ink only
```

## Results (Apple M1 Max, Bun 1.3.9)

_Last run: February 2026. These are the canonical Ink comparison numbers referenced by [docs/hightea-vs-ink.md](../../docs/hightea-vs-ink.md), [docs/benchmarks.md](../../docs/benchmarks.md), and [docs/deep-dives/performance.md](../../docs/deep-dives/performance.md)._

These benchmarks compare hightea to Ink 6.6.0 to help users understand performance characteristics. hightea builds upon Ink's foundational work, and we're grateful to the Ink project and its community. Methodology notes are included where the comparison approaches differ.

### Full Pipeline: React reconciliation → layout → string output

| Workload               | hightea (Flexture) | Ink 6 (Yoga NAPI) | Ratio     |
| ---------------------- | ------------ | ----------------- | --------- |
| 1 Box+Text (80×24)     | 172 µs       | 269 µs            | hightea 1.6x |
| 100 Box+Text (80×24)   | 45.9 ms      | 49.7 ms           | hightea 1.1x |
| 1000 Box+Text (120×40) | 443 ms       | 544 ms            | hightea 1.2x |

Note: hightea uses `createRenderer()` (headless, no stdout). Ink uses `render()` with mock stdout + unmount per iteration, which includes additional lifecycle overhead. Both include React reconciliation.

### Layout Engine (pure layout, no React)

| Workload       | Flexture (JS, 7KB) | Yoga WASM | Yoga NAPI (C++) |
| -------------- | --------------- | --------- | --------------- |
| 100 nodes      | 87 µs           | 88 µs     | 200 µs          |
| 50-node kanban | 62 µs           | 58 µs     | 136 µs          |

Flexture and Yoga WASM are ~2× faster than Yoga NAPI. The NAPI bridge overhead dominates.

### Re-render / Diff (update performance)

| Scenario                    | Time    |
| --------------------------- | ------- |
| ink rerender 100 Box+Text   | 2.3 ms  |
| ink rerender 1000 Box+Text  | 20.4 ms |
| hightea diff render 100 nodes  | 45 µs   |
| hightea diff render 1000 nodes | 164 µs  |

hightea's diff pipeline (0.16 ms for 1000 nodes) vs Ink's React rerender (20.4 ms for 1000 nodes). For most TUI updates that only change a few nodes, this architectural difference is significant.

Note: These measure different operations. Ink's `rerender()` triggers React reconciliation. hightea's diff render is a low-level pipeline operation that bypasses React, using dirty tracking to update only changed nodes. This comparison shows the benefit of hightea's architectural approach rather than a direct equivalent operation.

### Memory

Roughly equivalent: hightea 43.4 ms vs ink 49.6 ms for 100 Box+Text heap delta.

## Architectural Differences

| Aspect             | hightea                                     | Ink 6                          |
| ------------------ | ---------------------------------------- | ------------------------------ |
| Layout feedback    | Two-phase render, components know size   | Single-phase, no size feedback |
| Diff algorithm     | Cell-level with packed integer fast-path | Row-based string comparison    |
| Layout engine      | Flexture (default) or Yoga WASM             | Yoga NAPI only                 |
| Incremental render | Dirty tracking per-node                  | Full tree re-render            |
| Text truncation    | Auto-truncate during content phase       | Manual, per-component          |

## Benchmark Categories

### hightea suite (run.ts)

1. **React Render** — Full pipeline with `createRenderer()` (1, 100, 1000 Box+Text)
2. **Pipeline Render** — Low-level `executeRender` bypassing React (first render + diff render)
3. **Diff Performance** — Buffer comparison (no changes, 10% changes, full repaint)
4. **Resize Handling** — Re-layout after terminal size change (10, 100, 1000 nodes)
5. **Layout Engine** — Flexture vs Yoga WASM comparison
6. **Memory** — Heap delta for 100-component app

### Ink suite (ink-bench.ts)

1. **React Render** — Full pipeline with `render()` + mock stdout (1, 100, 1000 Box+Text)
2. **Re-render** — Update existing tree with `rerender()` (100, 1000 Box+Text)
3. **Pure Yoga Layout** — Raw `yoga-layout` (NAPI) node creation + calculation
4. **Memory** — Heap delta for 100-component app
