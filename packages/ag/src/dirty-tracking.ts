/**
 * Dirty Node Tracking
 *
 * Module-level Set<AgNode> that enables O(1) dirty checks for pipeline phases.
 * The reconciler adds nodes when dirty flags are set; pipeline phases query
 * the set to skip unnecessary work; the set is cleared after each render pass.
 *
 * Two categories tracked:
 * - contentDirtyNodes: nodes with any content/style dirty flag (need re-render)
 * - styleOnlyDirtyNodes: nodes where ONLY style changed (no content, no layout,
 *   no children) — eligible for the style-only fast path
 *
 * Layout dirty tracking is NOT here — Flexily owns it via isDirty() propagation.
 * The layout gate in ag.ts / layout-phase.ts checks root.layoutNode.isDirty().
 */

import type { AgNode } from "./types"

/**
 * Nodes with any content/style dirty flag. Written by reconciler,
 * read by render phase for targeted subtree entry.
 */
const contentDirtyNodes: Set<AgNode> = new Set()

/**
 * Nodes where ONLY style props changed (no content, layout, or children changes).
 * These are eligible for the style-only fast path in the render phase, which
 * updates cell styles without re-collecting text or re-computing layout.
 *
 * A node is style-only when commitUpdate classifies contentChanged="style"
 * AND layoutChanged=false. The render phase checks this set to decide whether
 * to use restyleRegion() instead of full renderText()/renderBox().
 */
const styleOnlyDirtyNodes: Set<AgNode> = new Set()

/**
 * Nodes where scrollTo/scrollOffset changed. These don't affect Flexily layout
 * dimensions, but the scroll, sticky, scrollRect, and notify phases must still
 * run to update visible children positions.
 *
 * Written by reconciler (host-config.ts commitUpdate), read by ag.ts
 * layout-on-demand gate.
 */
const scrollDirtyNodes: Set<AgNode> = new Set()

// ---------------------------------------------------------------------------
// Write API (reconciler)
// ---------------------------------------------------------------------------

/** Mark a node as content-dirty. Called when content/style flags are set. */
export function trackContentDirty(node: AgNode): void {
  contentDirtyNodes.add(node)
}

/**
 * Mark a node as style-only dirty. Called when commitUpdate sees
 * contentChanged="style" AND layoutChanged=false.
 * If a node is later marked with contentDirty, the render phase ignores
 * the style-only flag (full path takes precedence).
 */
export function trackStyleOnlyDirty(node: AgNode): void {
  styleOnlyDirtyNodes.add(node)
}

/** Mark a node as scroll-dirty. Called when scrollTo/scrollOffset props change. */
export function trackScrollDirty(node: AgNode): void {
  scrollDirtyNodes.add(node)
}

// ---------------------------------------------------------------------------
// Read API (pipeline phases)
// ---------------------------------------------------------------------------

/** O(1) check: are there any content-dirty nodes? */
export function hasContentDirty(): boolean {
  return contentDirtyNodes.size > 0
}

/** O(1) check: are there any scroll-dirty nodes? */
export function hasScrollDirty(): boolean {
  return scrollDirtyNodes.size > 0
}

/** O(1) check: is this node style-only dirty (eligible for fast path)? */
export function isStyleOnlyDirty(node: AgNode): boolean {
  return styleOnlyDirtyNodes.has(node)
}

/** Get the set of content-dirty nodes (for iteration). */
export function getContentDirtyNodes(): ReadonlySet<AgNode> {
  return contentDirtyNodes
}

// ---------------------------------------------------------------------------
// Clear API (after render pass)
// ---------------------------------------------------------------------------

/** Clear all dirty tracking. Called after each render pass completes. */
export function clearDirtyTracking(): void {
  contentDirtyNodes.clear()
  styleOnlyDirtyNodes.clear()
  scrollDirtyNodes.clear()
}
