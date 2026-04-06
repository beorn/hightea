/**
 * Selection state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Buffer-level text selection (like native terminal selection).
 * Operates on terminal buffer coordinates, not the React tree.
 */

import type { TerminalBuffer, RowMetadata } from "./buffer"

// ============================================================================
// Types
// ============================================================================

export interface SelectionPosition {
  col: number
  row: number
}

export interface SelectionRange {
  anchor: SelectionPosition
  head: SelectionPosition
}

/**
 * Rectangular boundary for contain-scoped selection.
 * Derived from the nearest `userSelect="contain"` ancestor's screenRect.
 */
export interface SelectionScope {
  top: number
  bottom: number
  left: number
  right: number
}

export interface TerminalSelectionState {
  range: SelectionRange | null
  /** True while mouse button is held */
  selecting: boolean
  /** Who initiated the selection */
  source: "mouse" | "keyboard" | null
  /** Selection granularity (char, word, line) */
  granularity: "char" | "word" | "line"
  /** Contain boundary — selection range is clamped to this rect */
  scope: SelectionScope | null
}

export type SelectionAction =
  | { type: "start"; col: number; row: number; scope?: SelectionScope | null; granularity?: "char" | "word" | "line"; source?: "mouse" | "keyboard" }
  | { type: "extend"; col: number; row: number }
  | { type: "finish" }
  | { type: "clear" }

export type SelectionEffect = { type: "copy"; text: string } | { type: "render" }

// ============================================================================
// State
// ============================================================================

export function createTerminalSelectionState(): TerminalSelectionState {
  return { range: null, selecting: false, source: null, granularity: "char", scope: null }
}

// ============================================================================
// Update
// ============================================================================

/**
 * Clamp a position to a scope boundary.
 */
function clampToScope(col: number, row: number, scope: SelectionScope | null): SelectionPosition {
  if (!scope) return { col, row }
  return {
    col: Math.max(scope.left, Math.min(scope.right, col)),
    row: Math.max(scope.top, Math.min(scope.bottom, row)),
  }
}

export function terminalSelectionUpdate(
  action: SelectionAction,
  state: TerminalSelectionState,
): [TerminalSelectionState, SelectionEffect[]] {
  switch (action.type) {
    case "start": {
      const scope = action.scope ?? null
      const pos = clampToScope(action.col, action.row, scope)
      return [{
        range: { anchor: pos, head: pos },
        selecting: true,
        source: action.source ?? "mouse",
        granularity: action.granularity ?? "char",
        scope,
      }, [{ type: "render" }]]
    }

    case "extend": {
      if (!state.selecting) return [state, []]
      const head = clampToScope(action.col, action.row, state.scope)
      return [{
        ...state,
        range: { anchor: state.range!.anchor, head },
        selecting: true,
      }, [{ type: "render" }]]
    }

    case "finish": {
      if (!state.range) return [{ ...state, selecting: false }, []]
      return [{ ...state, range: state.range, selecting: false }, []]
    }

    case "clear": {
      const hadRange = state.range !== null
      return [createTerminalSelectionState(), hadRange ? [{ type: "render" }] : []]
    }
  }
}

// ============================================================================
// Range Normalization
// ============================================================================

export function normalizeRange(range: SelectionRange): {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
} {
  const { anchor, head } = range

  if (anchor.row < head.row || (anchor.row === head.row && anchor.col <= head.col)) {
    return { startRow: anchor.row, startCol: anchor.col, endRow: head.row, endCol: head.col }
  }

  return { startRow: head.row, startCol: head.col, endRow: anchor.row, endCol: anchor.col }
}

// ============================================================================
// Text Extraction
// ============================================================================

export interface ExtractTextOptions {
  /** When true, skip cells that don't have SELECTABLE_FLAG set */
  respectSelectableFlag?: boolean
  /** Row metadata for soft-wrap handling and precise trailing space trimming */
  rowMetadata?: readonly RowMetadata[]
}

/**
 * Extract text from a buffer within a selection range.
 *
 * Handles:
 * - Soft-wrap joining (via RowMetadata.softWrapped)
 * - Trailing space trimming (via RowMetadata.lastContentCol or content scan)
 * - Blank line preservation within selection
 * - Wide-char continuation cell skipping
 * - SELECTABLE_FLAG filtering (when respectSelectableFlag is true)
 */
export function extractText(buffer: TerminalBuffer, range: SelectionRange, options?: ExtractTextOptions): string {
  const { startRow, startCol, endRow, endCol } = normalizeRange(range)
  const respectSelectable = options?.respectSelectableFlag ?? false
  const rowMeta = options?.rowMetadata

  const parts: string[] = []

  for (let row = startRow; row <= endRow; row++) {
    const colStart = row === startRow ? startCol : 0
    const colEnd = row === endRow ? endCol : buffer.width - 1

    let line = ""
    for (let col = colStart; col <= colEnd; col++) {
      // Skip wide-char continuation cells
      if (buffer.isCellContinuation(col, row)) continue

      // Skip non-selectable cells when flag checking is enabled
      if (respectSelectable && !buffer.isCellSelectable(col, row)) continue

      line += buffer.getCellChar(col, row)
    }

    // Trim trailing spaces using lastContentCol if available, otherwise fallback
    const meta = rowMeta?.[row]
    if (meta && meta.lastContentCol >= 0) {
      // Compute how much of the line is trailing whitespace
      // lastContentCol is the rightmost col with non-space content
      const effectiveEnd = row === endRow ? endCol : buffer.width - 1
      const trailingCols = effectiveEnd - meta.lastContentCol
      if (trailingCols > 0 && line.length > 0) {
        // Trim up to trailingCols chars of trailing spaces
        line = line.replace(/\s+$/, "")
      }
    } else {
      line = line.replace(/\s+$/, "")
    }

    // Preserve blank lines within selection (don't drop them)
    // but join soft-wrapped lines without a newline
    if (meta?.softWrapped && row < endRow) {
      parts.push(line)
    } else {
      parts.push(line)
      // Add newline separator unless this is the last row
      if (row < endRow) {
        parts.push("\n")
      }
    }
  }

  return parts.join("")
}
