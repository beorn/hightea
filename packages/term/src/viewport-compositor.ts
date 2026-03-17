/**
 * Viewport Compositor - Merges frozen history rows with the live viewport.
 *
 * When a user scrolls up into history, the compositor provides the
 * history rows that should be shown. When at the tail (scrollOffset=0),
 * the live React-rendered content is shown instead.
 *
 * This does NOT replace the React rendering pipeline. It provides
 * overlay data that the rendering layer can use when scrolled up.
 */

import type { HistoryBuffer } from "./history-buffer"

// ============================================================================
// Types
// ============================================================================

export interface ViewportCompositorConfig {
  /** The history buffer containing frozen items */
  history: HistoryBuffer
  /** Height of the viewport in rows */
  viewportHeight: number
  /** Current scroll offset into history (0 = at tail/live) */
  scrollOffset: number
}

export interface ComposedViewport {
  /** Rows from history to display (when scrolled up) */
  historyRows: string[]
  /** How many rows of history are visible */
  historyRowCount: number
  /** Whether we're showing any history (scrolled up) */
  isScrolledUp: boolean
  /** Total scrollable height (history rows + viewport) */
  totalHeight: number
}

// ============================================================================
// Compositor
// ============================================================================

export function composeViewport(config: ViewportCompositorConfig): ComposedViewport {
  const { history, viewportHeight, scrollOffset } = config

  const totalHistory = history.totalRows
  const isScrolledUp = scrollOffset > 0

  if (!isScrolledUp || totalHistory === 0) {
    return {
      historyRows: [],
      historyRowCount: 0,
      isScrolledUp: false,
      totalHeight: totalHistory + viewportHeight,
    }
  }

  // Clamp scroll offset to available history
  const clampedOffset = Math.min(scrollOffset, totalHistory)
  const rowsToShow = Math.min(viewportHeight, clampedOffset)

  const historyRows = history.getRows(clampedOffset - rowsToShow, rowsToShow)

  return {
    historyRows,
    historyRowCount: historyRows.length,
    isScrolledUp: true,
    totalHeight: totalHistory + viewportHeight,
  }
}
