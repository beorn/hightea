/**
 * Find state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Visible-buffer find with match navigation.
 * Searches the rendered terminal buffer for text matches.
 */

import type { TerminalBuffer } from "./buffer"

// ============================================================================
// Types
// ============================================================================

export interface FindMatch {
  row: number
  startCol: number
  endCol: number
}

export interface FindState {
  /** Current search query, or null if find is not active */
  query: string | null
  /** All matches in the visible buffer */
  matches: FindMatch[]
  /** Index of the currently focused match (-1 if no matches) */
  currentIndex: number
  /** Whether find mode is active */
  active: boolean
}

export type FindAction =
  | { type: "search"; query: string; buffer: TerminalBuffer }
  | { type: "next" }
  | { type: "prev" }
  | { type: "close" }
  | { type: "selectCurrent" }

export type FindEffect =
  | { type: "render" }
  | { type: "setSelection"; match: FindMatch }
  | { type: "scrollTo"; row: number }

// ============================================================================
// State
// ============================================================================

export function createFindState(): FindState {
  return {
    query: null,
    matches: [],
    currentIndex: -1,
    active: false,
  }
}

// ============================================================================
// Buffer Search
// ============================================================================

/**
 * Search a terminal buffer for all occurrences of a query string.
 * Case-insensitive. Searches row by row, does not span rows.
 *
 * Returns matches sorted by position (row ascending, col ascending).
 */
export function searchBuffer(buffer: TerminalBuffer, query: string): FindMatch[] {
  if (!query || query.length === 0) return []

  const lowerQuery = query.toLowerCase()
  const matches: FindMatch[] = []

  for (let row = 0; row < buffer.height; row++) {
    // Build the row string from buffer cells
    let rowText = ""
    for (let col = 0; col < buffer.width; col++) {
      rowText += buffer.getCell(col, row).char
    }

    // Search case-insensitively
    const lowerRow = rowText.toLowerCase()
    let searchFrom = 0

    while (searchFrom <= lowerRow.length - lowerQuery.length) {
      const idx = lowerRow.indexOf(lowerQuery, searchFrom)
      if (idx === -1) break

      matches.push({
        row,
        startCol: idx,
        endCol: idx + lowerQuery.length - 1,
      })

      // Move past this match to find overlapping matches
      searchFrom = idx + 1
    }
  }

  return matches
}

// ============================================================================
// Update
// ============================================================================

export function findUpdate(action: FindAction, state: FindState): [FindState, FindEffect[]] {
  switch (action.type) {
    case "search": {
      const matches = searchBuffer(action.buffer, action.query)
      const currentIndex = matches.length > 0 ? 0 : -1
      const effects: FindEffect[] = [{ type: "render" }]
      if (currentIndex >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [
        {
          query: action.query,
          matches,
          currentIndex,
          active: true,
        },
        effects,
      ]
    }

    case "next": {
      if (!state.active || state.matches.length === 0) return [state, []]
      const currentIndex = (state.currentIndex + 1) % state.matches.length
      const match = state.matches[currentIndex]!
      return [
        { ...state, currentIndex },
        [{ type: "render" }, { type: "scrollTo", row: match.row }],
      ]
    }

    case "prev": {
      if (!state.active || state.matches.length === 0) return [state, []]
      const currentIndex = (state.currentIndex - 1 + state.matches.length) % state.matches.length
      const match = state.matches[currentIndex]!
      return [
        { ...state, currentIndex },
        [{ type: "render" }, { type: "scrollTo", row: match.row }],
      ]
    }

    case "close": {
      return [createFindState(), [{ type: "render" }]]
    }

    case "selectCurrent": {
      if (!state.active || state.currentIndex < 0 || state.currentIndex >= state.matches.length) {
        return [state, []]
      }
      const match = state.matches[state.currentIndex]!
      return [state, [{ type: "setSelection", match }]]
    }
  }
}
