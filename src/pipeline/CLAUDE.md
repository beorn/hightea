# Pipeline Internals

Read this before modifying content-phase.ts, render-text.ts, render-box.ts, or layout-phase.ts. These files implement incremental rendering -- the most complex and bug-prone part of inkx.

## Pipeline Overview

The render pipeline runs on every frame. Phases execute in strict order:

```
measure -> layout -> scroll -> screenRect -> [notify] -> content -> output
```

| Phase | File | What it does |
|-------|------|-------------|
| measure | measure-phase.ts | Set Yoga constraints for fit-content nodes |
| layout | layout-phase.ts | Run `calculateLayout()`, propagate rects, set `prevLayout` and `subtreeDirty` |
| scroll | layout-phase.ts | Calculate scroll offset, visible children, sticky positions for overflow=scroll containers |
| screenRect | layout-phase.ts | Compute screen-relative positions (content position minus ancestor scroll offsets) |
| notify | layout-phase.ts | Fire `layoutSubscribers` callbacks (drives `useContentRect`/`useScreenRect`) |
| **content** | **content-phase.ts** | **Render nodes to a TerminalBuffer (this is the complex part)** |
| output | output-phase.ts | Diff current buffer against previous, emit minimal ANSI escape sequences |

Orchestrated by `executeRender()` in `pipeline/index.ts`. The scheduler (`scheduler.ts`) calls `executeRender()` and passes the previous frame's buffer for incremental rendering.

## Dirty Flags

The reconciler sets flags on nodes when props/children change. The content phase reads them to decide what to re-render. All are cleared by the content phase after processing.

| Flag | Set by | Meaning |
|------|--------|---------|
| `contentDirty` | Reconciler | Text content or content-affecting props changed |
| `paintDirty` | Reconciler | Visual props changed (color, bg, border). Survives measure phase clearing `contentDirty` |
| `bgDirty` | Reconciler | `backgroundColor` specifically changed (added, modified, or removed) |
| `subtreeDirty` | Layout phase / reconciler | Some descendant has dirty flags. Node's OWN rendering may be skippable |
| `childrenDirty` | Reconciler | Direct children added, removed, or reordered |
| `layoutDirty` | Reconciler | Layout-affecting props changed; triggers Yoga recalculation |

The layout phase also sets `subtreeDirty` upward when a descendant's `contentRect` changes.

## Incremental Rendering Model

This is the core optimization. Instead of rendering every node every frame, the content phase:

1. **Clones** the previous frame's buffer (the buffer the output phase already diffed)
2. **Skips** subtrees where nothing changed (their pixels are already correct in the clone)
3. **Re-renders** only dirty nodes and their affected descendants

The fast-path skip condition (all must be false to skip):

```typescript
!node.contentDirty &&
!node.paintDirty &&
!layoutChanged &&          // !rectEqual(node.prevLayout, node.contentRect)
!node.subtreeDirty &&
!node.childrenDirty &&
!childPositionChanged      // any child's x/y differs from prevLayout
```

If `hasPrevBuffer` is false (first render or dimension change), nothing is skipped.

### Key Invariant

**Incremental render must produce identical output to a fresh render.** `INKX_STRICT=1` verifies this by running both and comparing cell-by-cell. Every content-phase change must be validated against this invariant.

## The hasPrevBuffer / ancestorCleared Cascade

These two flags propagate down through `renderNodeToBuffer` calls and control whether children treat the buffer as containing valid previous pixels or stale/cleared pixels.

### hasPrevBuffer

Passed to each child. When true, the child can use the fast-path skip (its pixels are intact from the previous frame). When false, the child must render even if its own flags are clean.

A parent sets `childHasPrev = false` when:
- `childrenDirty` is true (children restructured)
- `childPositionChanged` is true (sibling sizes shifted positions)
- `parentRegionChanged` is true (parent's content area was modified)

### ancestorCleared

Tells descendants that an ancestor erased the buffer at their position. This is separate from `hasPrevBuffer` because scroll containers may pass `childHasPrev=false` while the buffer still has stale pixels from the clone -- the parent cleared its own region but descendants may need to clear sub-regions.

### The Critical Formulas

These five computed values in `renderNodeToBuffer` control the entire incremental cascade:

```typescript
// Did this node's layout position/size change?
layoutChanged = !rectEqual(node.prevLayout, node.contentRect)

// Did the CONTENT AREA change? (excludes border-only paint changes)
contentAreaAffected =
  node.contentDirty || layoutChanged || childPositionChanged ||
  node.childrenDirty || node.bgDirty

// Should we clear this node's region with inherited bg?
// Only when: buffer has stale pixels AND content area changed AND no own bg fill
parentRegionCleared =
  (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor

// Can we skip the bg fill? Only when clone has correct bg already
skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected

// Must children re-render? (content area was modified on a cloned buffer)
parentRegionChanged = (hasPrevBuffer || ancestorCleared) && contentAreaAffected
```

### How the cascade propagates to children

```typescript
// Normal containers:
childHasPrev = (childrenDirty || childPositionChanged || parentRegionChanged) ? false : hasPrevBuffer
childAncestorCleared = parentRegionCleared || (ancestorCleared && !props.backgroundColor)
```

Key insight: a Box with `backgroundColor` **breaks** the ancestorCleared cascade. Its `renderBox` fill covers stale pixels, so children don't need to know about ancestor clears. Without this, border cells at boundaries get overwritten.

### Why contentAreaAffected is NOT needsOwnRepaint

`needsOwnRepaint` includes `paintDirty` (e.g., borderColor change). `contentAreaAffected` excludes pure paint changes because a border-only change doesn't affect the content area -- the clone already has the correct bg. Using `needsOwnRepaint` for `parentRegionChanged` caused border color changes to cascade re-renders through ~200 child nodes per Card.

### Why bgDirty exists

When `backgroundColor` changes from `"cyan"` to `undefined`, the current value is falsy but stale cyan pixels remain in the clone. `bgDirty` (set by reconciler specifically for bg changes) ensures `contentAreaAffected` is true so the region gets cleared.

## Scroll Container Three-Tier Strategy

Scroll containers (`overflow="scroll"`) have special rendering logic in `renderScrollContainerChildren`:

### Tier 1: Buffer Shift (scrollOnly)

When ONLY the scroll offset changed (no child/parent changes):
- Shift buffer contents by the scroll delta via `buffer.scrollRegion()`
- Only re-render newly exposed children at the edges
- Previously visible children keep their shifted pixels

**Unsafe with sticky children** -- sticky headers render in a second pass that overwrites first-pass content. After a shift, those overwritten pixels corrupt items at new positions. Falls back to Tier 2.

### Tier 2: Full Viewport Clear (needsViewportClear)

When children restructured, scroll offset changed with sticky children, or parent region changed:
- Clear entire viewport with inherited bg
- Re-render all visible children (childHasPrev=false)

`subtreeDirty` alone does NOT trigger viewport clear. Clearing for subtreeDirty caused a 12ms regression (re-rendering ~50 children vs 2 dirty ones).

### Tier 3: Subtree-Dirty Only

When only some descendants changed:
- Children use `hasPrevBuffer=true` and skip via fast-path if clean
- Only dirty descendants re-render

**Exception with sticky children**: When sticky children exist in Tier 3, all first-pass items are forced to re-render (`stickyForceRefresh`). This is needed because of the Text bg inheritance coupling (see next section).

## Sticky Children Two-Pass Rendering

Scroll containers with `position="sticky"` children render in two passes:

1. **First pass**: Non-sticky items, rendered with scroll offset
2. **Second pass**: Sticky headers, rendered at their computed sticky positions (hasPrevBuffer=false, ancestorCleared=false)

Order matters: sticky headers render ON TOP of first-pass content. The second pass uses `hasPrevBuffer=false` because the effective scroll offset for a sticky child can change even when the container's doesn't.

Sticky children use `ancestorCleared=false` to match fresh render semantics. On a fresh render, the buffer at sticky positions has first-pass content, not "cleared" space. Using `ancestorCleared=true` would cause transparent spacer Boxes to clear their region, wiping overlapping sticky headers rendered earlier in the second pass.

## Text Background Inheritance (getCellBg)

This is a critical coupling between buffer state and rendering.

In `render-text.ts`, when rendering graphemes:

```typescript
// Line 600 of render-text.ts
const existingBg = style.bg === null ? buffer.getCellBg(col, y) : style.bg
```

When a Text node has no explicit background, it **reads the buffer** to inherit the background from whatever was rendered underneath (typically a parent Box's bg fill). This creates a dependency:

**The buffer state at the time Text renders determines the Text's background color.**

This is why `stickyForceRefresh` exists: in Tier 3 incremental renders, the cloned buffer may have stale bg from PREVIOUS frames' sticky headers at old positions. If a Text node at that position reads stale bg, the output differs from a fresh render. The solution is to clear the viewport to null bg (matching fresh buffer state) and force all items to re-render before the sticky pass.

Nested Text `backgroundColor` is handled separately via `BgSegment` tracking (not ANSI codes) to prevent bg bleed across wrapped text lines.

## Normal Container Two-Pass Rendering

`renderNormalChildren` also uses two passes (CSS paint order):

1. **First pass**: Normal-flow children
2. **Second pass**: `position="absolute"` children (rendered on top)

Without two-pass, an absolute child rendered before a dirty normal-flow sibling would get its bg wiped by the sibling's `clearNodeRegion`. When any normal-flow sibling is dirty, absolute children in the second pass use `hasPrevBuffer=false` (force repaint) and `ancestorCleared=false`.

## Region Clearing

When a node's content area changed but it has no `backgroundColor`, stale pixels from the clone remain visible. `clearNodeRegion` fills the node's rect with inherited bg (found by walking up ancestors via `findInheritedBg`).

When a node shrinks, the excess area (old bounds minus new bounds) is also cleared. This excess clearing clips to the colored ancestor's bounds to prevent inherited bg from bleeding into sibling areas.

## prevLayout Staleness (Known Issue)

`prevLayout` is set by the layout phase and intentionally NOT updated by the content phase. This means `prevLayout=null` after the first render causes `layoutChanged=true` for all nodes on every subsequent render. The content phase currently relies on `layoutChanged=true` as a catch-all for `contentAreaAffected` region clearing. Fixing this requires also fixing `contentAreaAffected` to account for `subtreeDirty` (descendant content changes that shrink and leave stale pixels).

## Common Pitfalls

1. **Transparent Boxes cascade clears.** A Box without `backgroundColor` propagates `ancestorCleared` to all descendants. A Box WITH `backgroundColor` breaks the cascade because its fill covers stale pixels. This is intentional -- don't remove the `!props.backgroundColor` check from `childAncestorCleared`.

2. **Border-only changes must not cascade.** `paintDirty` without `bgDirty` means only the border changed. This must NOT trigger `contentAreaAffected` or `parentRegionChanged`, otherwise every borderColor change cascades through the entire subtree.

3. **Buffer shift + sticky = corruption.** Never use Tier 1 (scrollRegion shift) when sticky children exist. The sticky second pass overwrites pixels that the shift assumed were final.

4. **Scroll Tier 3 + sticky = stale bg.** The cloned buffer has stale bg from previous frames' sticky positions. Tier 3 (no viewport clear) must force all items to re-render and pre-clear to null bg.

5. **Absolute children need ancestorCleared=false in second pass.** After the first pass, the buffer at absolute positions has correct normal-flow content. Setting ancestorCleared=true causes transparent absolute overlays to clear that content.

6. **skipBgFill is critical for subtreeDirty.** When only a descendant changed, the parent's bg fill must be skipped. Re-filling destroys child pixels that won't be repainted (they're clean and will be fast-path skipped).

7. **getCellBg coupling.** Text nodes read buffer bg. Any change to when/how regions are cleared or filled can change what Text renders, causing INKX_STRICT mismatches.

## Debugging

```bash
# Verify incremental vs fresh render equivalence
INKX_STRICT=1 bun km view /path

# Write pipeline debug output
DEBUG=inkx:* DEBUG_LOG=/tmp/inkx.log bun km view /path

# Enable instrumentation counters (exposed on globalThis.__inkx_content_detail)
INKX_INSTRUMENT=1 bun km view /path
```

The content phase has extensive instrumentation gated on `_instrumentEnabled` -- node visit/skip/render counts, cascade diagnostics, scroll container tier decisions, and per-node trace entries.

## File Map

| File | Responsibility |
|------|---------------|
| content-phase.ts | Tree traversal, dirty-flag evaluation, incremental cascade logic, scroll container tiers, region clearing |
| render-box.ts | Box bg fill (`skipBgFill` aware), border rendering, scroll indicators |
| render-text.ts | Text content collection, ANSI parsing, bg segment tracking, `getCellBg` inheritance, bg conflict detection |
| layout-phase.ts | Layout calculation, scroll state, screen rects, layout subscriber notification |
| measure-phase.ts | Intrinsic size measurement for fit-content nodes |
| output-phase.ts | Buffer diff, dirty row tracking, minimal ANSI output generation |
| render-helpers.ts | Color parsing, text width, border chars, style computation |
| helpers.ts | Border/padding size calculation |
