/**
 * Render Epoch
 *
 * A monotonically increasing counter that replaces boolean dirty flags.
 * Instead of setting `node.contentDirty = true` and later clearing with
 * `node.contentDirty = false`, the reconciler stamps `node.contentDirtyEpoch = renderEpoch`
 * and the render phase checks `node.contentDirtyEpoch === renderEpoch`.
 *
 * Clearing all flags is O(1): just `renderEpoch++`. The old O(N) tree walk
 * in clearDirtyFlags becomes unnecessary — stale epoch stamps automatically
 * read as "not dirty" once the epoch advances.
 *
 * INITIAL_EPOCH (-1) is the sentinel for "never dirty". New nodes use the
 * current epoch so they appear dirty on first render.
 */

/** Sentinel value: node has never been marked dirty for this flag. */
export const INITIAL_EPOCH = -1

/**
 * The current render epoch. Incremented after each render pass.
 * Reconciler stamps dirty nodes with this value; render phase checks equality.
 */
let renderEpoch = 0

/** Get the current render epoch value. */
export function getRenderEpoch(): number {
  return renderEpoch
}

/**
 * Advance the render epoch. Called once at the end of each render pass.
 * All nodes stamped with the old epoch instantly become "not dirty".
 */
export function advanceRenderEpoch(): void {
  renderEpoch++
}

/**
 * Check if an epoch stamp matches the current render epoch (i.e., "is dirty").
 */
export function isCurrentEpoch(epoch: number): boolean {
  return epoch === renderEpoch
}
