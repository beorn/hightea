# Inkx Performance Analysis

## Benchmark Results (M1 Max, Bun 1.3.9)

### inkx vs Ink 6 (Full Pipeline)

| Components | inkx (Flexx) | Ink 6 (Yoga NAPI) | Ratio     |
| ---------- | ------------ | ----------------- | --------- |
| 1          | 172 us       | 269 us            | inkx 1.6x |
| 100        | 45.9 ms      | 49.7 ms           | inkx 1.1x |
| 1000       | 443 ms       | 544 ms            | inkx 1.2x |

inkx uses `createRenderer()` (headless). Ink uses `render()` with mock stdout + unmount per iteration. Both include React reconciliation. See [benchmark README](../benchmarks/ink-comparison/README.md) for full methodology and additional comparisons.

### inkx Pipeline Summary

| Operation                     | Time  | Notes                  |
| ----------------------------- | ----- | ---------------------- |
| Full render (simple, first)   | 54us  | First render, no diff  |
| Full render (simple, diff)    | 25us  | With buffer diffing    |
| Full render (50 items, first) | 159us | Complex tree           |
| Full render (50 items, diff)  | 88us  | Complex tree with diff |
| contentPhase (100 children)   | 26us  | Optimized with caching |
| layoutPhase (100 children)    | 25us  | Flexx layout           |

### Layout Engine Comparison

| Benchmark             | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
| --------------------- | ---------- | --------- | --------------- |
| 100 nodes flat list   | 87 us      | 88 us     | 200 us          |
| 50-node kanban (3col) | 62 us      | 58 us     | 136 us          |

Flexx and Yoga WASM perform similarly. Both are ~2x faster than Yoga NAPI (native C++) due to NAPI bridge overhead.

### Key Optimizations Implemented

#### Round 1: Content & Diff Foundations

1. **displayWidth LRU cache**: String width calculation is expensive (~8us).
   Added a 1000-entry LRU cache that reduces repeated lookups to ~180ns (45x faster).

2. **Buffer-level cellEquals**: The output diff now uses `buffer.cellEquals()` which
   compares packed Uint32Array integers before falling back to full cell comparison.
   This made "no changes" diff 3.3x faster.

3. **Dimension-aware diffing**: Buffer diff now handles size mismatches properly,
   only comparing the overlapping region and adding new cells as needed.

#### Round 2: Output Pipeline (2026-02-10)

4. **True Color Map skip in fill()** (buffer.ts): `fill()` was calling `Map.delete()`
   per cell for fgColors/bgColors/underlineColors even when maps were empty. Now checks
   `map.size > 0` before the delete loop. Saves ~3 Map operations × 4000 cells per clear.

5. **Row-level dirty tracking** (buffer.ts, output-phase.ts): Added `_dirtyRows: Uint8Array`
   bitset to TerminalBuffer. `setCell()` and `fill()` mark rows dirty. `diffBuffers()` skips
   clean rows entirely. For cursor movement (2-4 rows change out of ~50), this eliminates
   ~90% of cell comparisons. Lifecycle: fresh buffers start all-dirty, `clone()` starts
   all-clean, content phase marks dirty rows, diff skips clean rows.

6. **Style interning + SGR caching** (output-phase.ts): Unique style combinations are
   interned to a string key, and the corresponding SGR escape string is cached in a
   `Map<string, string>`. Eliminates repeated `styleToAnsi()` string building (~10
   concatenations per style change) in the diff output hot path.

7. **Viewport clipping in content phase** (content-phase.ts): Early exit in
   `renderNodeToBuffer()` when a node is entirely off-screen (`screenY >= buffer.height`
   or `screenY + layout.height <= 0`). Defense-in-depth for non-VirtualList containers.

### Performance Improvements

#### Round 1 (Content & Diff)

| Metric                           | Before    | After    | Improvement     |
| -------------------------------- | --------- | -------- | --------------- |
| `displayWidth ASCII`             | 8,181ns   | 181ns    | **45x faster**  |
| `displayWidth mixed`             | 3,016ns   | 173ns    | **17x faster**  |
| `outputPhase (no changes)`       | 76,191ns  | 23,276ns | **3.3x faster** |
| `outputPhase (10% changes)`      | 85,229ns  | 36,906ns | **2.3x faster** |
| `contentPhase (100 children)`    | 503,000ns | 26,011ns | **19x faster**  |
| `executeRender (simple, diff)`   | 76,601ns  | 25,230ns | **3x faster**   |
| `executeRender (50 items, diff)` | 362,000ns | 87,953ns | **4x faster**   |

#### Round 2 (Output Pipeline, 2026-02-10)

| Metric                           | Before (R1) | After (R2) | Improvement     |
| -------------------------------- | ----------- | ---------- | --------------- |
| `fill 80x24`                     | 12,938ns    | 3,114ns    | **4.2x faster** |
| `executeRender (simple, diff)`   | 42,724ns    | 9,477ns    | **4.5x faster** |
| `executeRender (50 items, diff)` | 117,000ns   | 34,449ns   | **3.4x faster** |

### Key Findings

1. **Diff path is now faster than first render**: With optimizations, diff renders
   take 2.1x less time than first renders (was 1.5x slower before).

2. **Cache hit rate matters**: The displayWidth cache provides massive speedups
   for repeated strings (common in UIs with consistent text content).

3. **Layout is consistently fast**: Yoga layout for 100 children takes ~25us
   thanks to dirty tracking - similar to optimized content phase.

4. **Unicode operations remain expensive**: `splitGraphemes` still takes 10us
   for ASCII strings - consider caching if profiling shows hot paths.

## Current Optimizations

### Core Optimizations

1. **Dirty Tracking (layout-phase.ts)**
   - `layoutDirty` flag on nodes prevents unnecessary Yoga recalculation
   - `hasLayoutDirtyNodes()` early exit when nothing changed
   - `layoutEqual()` check before notifying subscribers

2. **Buffer Diffing (output-phase.ts)**
   - `diffBuffers()` uses buffer-level `cellEquals()` for fast integer comparison
   - Cursor position optimization (uses newlines when efficient)
   - Style coalescing (only emit style changes when needed)
   - Dimension-aware diffing handles resize gracefully

3. **Content Dirty Tracking (reconciler.ts)**
   - `contentDirty` flag on nodes
   - `layoutPropsChanged()` vs `contentPropsChanged()` separation
   - Only re-render nodes whose content actually changed

4. **Efficient Buffer Storage (buffer.ts)**
   - Uint32Array for packed cell metadata
   - Separate string array for characters
   - Map for true color storage (sparse, with skip-empty optimization)
   - Fast `cellEquals()` compares packed metadata before full comparison

5. **displayWidth LRU Cache (unicode.ts)**
   - 1000-entry LRU cache for string width calculations
   - Cache hits are ~45x faster than computing width
   - Automatically evicts oldest entries when full

6. **Row-Level Dirty Tracking (buffer.ts, output-phase.ts)**
   - `Uint8Array` bitset tracks which rows were modified during content phase
   - `setCell()`, `fill()`, `scrollRegion()`, `copyFrom()` mark rows dirty
   - `diffBuffers()` skips clean rows entirely (~90% skip for cursor movement)
   - Lifecycle: fresh=all-dirty, clone=all-clean, content marks dirty, diff skips clean

7. **Style Interning + SGR Cache (output-phase.ts)**
   - Unique styles interned to string key via `styleToKey()`
   - Pre-computed SGR escape strings cached in `Map<string, string>`
   - Eliminates repeated `styleToAnsi()` string building in diff hot path

8. **Viewport Clipping (content-phase.ts)**
   - Early exit for nodes entirely off-screen in `renderNodeToBuffer()`
   - Defense-in-depth for non-VirtualList scroll containers

### Medium-Effort Improvements

#### ~~1. Spatial Skip in contentPhase~~ ✓ Implemented (Round 2, opt #7)

#### 2. Incremental Content Rendering ✓ Already exists

The content phase clones the previous buffer and only re-renders dirty subtrees.
Clean nodes keep their pixels from the clone. This IS incremental rendering.

#### ~~3. Row-Based Diff in outputPhase~~ ✓ Implemented (Round 2, opt #5)

Row-level dirty tracking via `Uint8Array` bitset — more precise than row hashing.

### Major Optimizations (Future)

#### 1. Virtual Scrolling

For scroll containers with many children:

- Only create/render visible children
- Use placeholder nodes for off-screen items
- Recycle nodes as user scrolls

#### 2. Layout Caching

Cache Yoga layout results when dimensions don't change:

```typescript
// Key: (props_hash, available_width, available_height)
// Value: computed_layout
```

#### 3. Worker Thread for Layout

Move Yoga calculation to worker thread for large trees.

#### 4. Content Buffer Pooling

Reuse TerminalBuffer instances instead of allocating new ones each render.

## Profiling Guide

### Run Benchmarks

```bash
cd /Users/beorn/Code/pim/km/vendor/beorn-inkx
bun run bench           # Internal benchmarks
bun run bench:compare   # Head-to-head inkx vs Ink 6
```

### Profile Specific Phases

```typescript
import {
  measurePhase,
  layoutPhase,
  contentPhase,
  outputPhase,
} from "inkx/pipeline"

const start = performance.now()
measurePhase(root)
console.log("measure:", performance.now() - start)
// ... etc
```

### Memory Profiling

```bash
bun --inspect run examples/dashboard/index.tsx
# Open chrome://inspect in Chrome
```

## Performance Best Practices

### For Users

1. **Use `display: 'none'`** for hidden components (skips layout entirely)
2. **Minimize re-renders** - use React.memo() for static content
3. **Avoid deeply nested trees** - flatten when possible
4. **Use `overflow: 'scroll'`** for long lists (enables culling)
5. **Batch state updates** - scheduler coalesces rapid changes

### For Contributors

1. **Avoid calling `displayWidth()` in hot paths** - cache results
2. **Check dirty flags before work** - early exit is cheap
3. **Prefer mutation over allocation** in render loop
4. **Profile before optimizing** - benchmarks don't lie
