/**
 * withLayoutSignals — reactive signal layer for AgNode layout outputs.
 *
 * Composable plugin that wraps an AgNode with reactive signals for layout
 * rects, text content, and focus state. Engine-agnostic — works with
 * Flexily, Yoga, or any future layout engine.
 *
 * Signals are WeakMap-backed and lazily created. Nodes without subscribers
 * pay zero cost. After layout completes, the pipeline calls `syncSignals()`
 * to propagate imperative state into signals.
 *
 * ## Usage
 *
 * ```ts
 * import { getLayoutSignals, syncSignals } from "@silvery/ag/layout-signals"
 *
 * // Get (or create) signals for a node
 * const signals = getLayoutSignals(node)
 * signals.boxRect()       // read current rect
 * signals.textContent()   // read current text
 *
 * // After layout/reconciler mutations, sync imperative → reactive
 * syncSignals(node)
 * ```
 *
 * ## Three-layer stack
 *
 * Layer 0: alien-signals (signal, computed, effect)
 * Layer 1: getLayoutSignals() — this module (@silvery/ag, framework-agnostic)
 * Layer 2: useSignal(signal) — @silvery/ag-react (React bridge)
 * Layer 3: useBoxRect(), useAgNode() — semantic convenience hooks
 */

import { signal } from "@silvery/signals"
import type { AgNode, Rect } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * Writable signal — call with no args to read, call with value to write.
 */
type WritableSignal<T> = {
  (): T
  (value: T): void
}

/**
 * Reactive projection of `AgNode.scrollState` — the layout-phase's pixel-space
 * truth about what's visible in an `overflow="scroll"` container.
 *
 * This is the **single source of truth** that virtualization consumers (like
 * `useVirtualizer` + `ListView`) read to decide which items to render. By
 * subscribing to this signal instead of independently computing their own
 * visible range, consumers cannot diverge from what layout-phase actually
 * laid out on screen.
 *
 * Fields are pixel-space integers already rounded by the layout engine —
 * re-using them (instead of recomputing via `sumHeights`) guarantees
 * `leadingHeight == scrollOffset` by construction.
 *
 * `null` for non-scroll containers and for scroll containers before the first
 * layout pass (bootstrap state — virtualizers must fall back to estimates).
 */
export interface ScrollStateSnapshot {
  /** Current scroll offset in terminal rows (pixel-space, pre-rounded). */
  readonly offset: number
  /** Total content height (all children) in rows. */
  readonly contentHeight: number
  /** Visible height (container height minus borders/padding). */
  readonly viewportHeight: number
  /** Index of the first visible child (flexbox-measured). */
  readonly firstVisibleChild: number
  /** Index of the last visible child (flexbox-measured). */
  readonly lastVisibleChild: number
  /** Count of items hidden above the viewport. */
  readonly hiddenAbove: number
  /** Count of items hidden below the viewport. */
  readonly hiddenBelow: number
}

/**
 * All reactive signals for an AgNode.
 *
 * Combined rect signals (layout outputs) + node signals (content/state).
 * One interface, one WeakMap, one sync function.
 */
export interface LayoutSignals {
  // Layout rects (synced after layout + scroll + sticky phases)
  readonly boxRect: WritableSignal<Rect | null>
  readonly scrollRect: WritableSignal<Rect | null>
  readonly screenRect: WritableSignal<Rect | null>

  // Scroll state for overflow="scroll" containers (null otherwise, or until
  // first layout pass). Peer of rect signals — synced by syncRectSignals.
  readonly scrollState: WritableSignal<ScrollStateSnapshot | null>

  // Node state (synced from reconciler + focus manager)
  readonly textContent: WritableSignal<string | undefined>
  readonly focused: WritableSignal<boolean>
}

// ============================================================================
// Cache
// ============================================================================

const signalMap = new WeakMap<AgNode, LayoutSignals>()

/**
 * Get or create layout signals for a node.
 *
 * Lazily created on first access. Automatically garbage-collected
 * when the node is removed from the tree (WeakMap semantics).
 */
export function getLayoutSignals(node: AgNode): LayoutSignals {
  let s = signalMap.get(node)
  if (!s) {
    s = {
      boxRect: signal<Rect | null>(node.boxRect),
      scrollRect: signal<Rect | null>(node.scrollRect),
      screenRect: signal<Rect | null>(node.screenRect),
      scrollState: signal<ScrollStateSnapshot | null>(snapshotScrollState(node)),
      textContent: signal<string | undefined>(node.textContent),
      focused: signal<boolean>(node.interactiveState?.focused ?? false),
    }
    signalMap.set(node, s)
  }
  return s
}

/**
 * Project AgNode.scrollState → ScrollStateSnapshot (the subset the virtualizer
 * needs). Returns null if the node has no scroll state yet (non-scroll
 * containers or fresh scroll containers pre-layout).
 *
 * Keeping this projection tight means callers can compare snapshots by
 * per-field equality without pulling the mutable underlying object into
 * consumer code.
 */
function snapshotScrollState(node: AgNode): ScrollStateSnapshot | null {
  const ss = node.scrollState
  if (!ss) return null
  return {
    offset: ss.offset,
    contentHeight: ss.contentHeight,
    viewportHeight: ss.viewportHeight,
    firstVisibleChild: ss.firstVisibleChild,
    lastVisibleChild: ss.lastVisibleChild,
    hiddenAbove: ss.hiddenAbove,
    hiddenBelow: ss.hiddenBelow,
  }
}

/** Per-field equality check for ScrollStateSnapshot (skips allocation). */
function scrollStateEqual(
  a: ScrollStateSnapshot | null,
  b: ScrollStateSnapshot | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.offset === b.offset &&
    a.contentHeight === b.contentHeight &&
    a.viewportHeight === b.viewportHeight &&
    a.firstVisibleChild === b.firstVisibleChild &&
    a.lastVisibleChild === b.lastVisibleChild &&
    a.hiddenAbove === b.hiddenAbove &&
    a.hiddenBelow === b.hiddenBelow
  )
}

/** Check whether a node has signals allocated (for testing). */
export function hasLayoutSignals(node: AgNode): boolean {
  return signalMap.has(node)
}

// ============================================================================
// Sync: imperative state → signals
// ============================================================================

/**
 * Sync all rect signals from the node's current values.
 *
 * Called from notifyLayoutSubscribers after layout + scroll + sticky
 * phases complete. Only syncs nodes that have signals allocated.
 * Reference-equality check prevents unnecessary downstream updates.
 */
export function syncRectSignals(node: AgNode): void {
  const s = signalMap.get(node)
  if (!s) return

  if (node.boxRect !== s.boxRect()) s.boxRect(node.boxRect)
  if (node.scrollRect !== s.scrollRect()) s.scrollRect(node.scrollRect)
  if (node.screenRect !== s.screenRect()) s.screenRect(node.screenRect)

  // Sync scrollState signal — projects AgNode.scrollState (layout-phase's
  // pixel-space truth) into a reactive snapshot. `useScrollState` consumers
  // re-render only when a field changes, not on every layout pass.
  //
  // Per-field equality check below means the signal stays reference-stable
  // when layout runs without state changes — critical for avoiding spurious
  // re-renders in virtualizer consumers (they'd otherwise re-evaluate their
  // window on every frame, defeating the point of subscribing).
  const nextScrollState = snapshotScrollState(node)
  if (!scrollStateEqual(nextScrollState, s.scrollState())) {
    s.scrollState(nextScrollState)
  }
}

/**
 * Sync textContent signal from the node's current value.
 *
 * Called from commitTextUpdate in the reconciler.
 */
export function syncTextContentSignal(node: AgNode): void {
  const s = signalMap.get(node)
  if (!s) return

  if (node.textContent !== s.textContent()) s.textContent(node.textContent)
}

/**
 * Sync focused signal for a node.
 *
 * Called from FocusManager when focus changes.
 */
export function syncFocusedSignal(node: AgNode, focused: boolean): void {
  const s = signalMap.get(node)
  if (!s) return

  if (focused !== s.focused()) s.focused(focused)
}
