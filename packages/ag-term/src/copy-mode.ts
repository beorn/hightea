/**
 * Copy-mode state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Keyboard-driven selection mode (vim-like visual mode).
 * When active, h/j/k/l navigate a cursor, v/V toggle visual selection,
 * y yanks (copies) the selection and exits.
 */

// ============================================================================
// Types
// ============================================================================

export interface CopyModePosition {
  col: number
  row: number
}

export interface CopyModeState {
  /** Whether copy-mode is active */
  active: boolean
  /** Current cursor position */
  cursor: CopyModePosition
  /** Character-wise visual mode (v) */
  visual: boolean
  /** Line-wise visual mode (V) */
  visualLine: boolean
  /** Start of visual selection (set when visual mode is entered) */
  anchor: CopyModePosition | null
  /** Buffer dimensions for boundary clamping */
  bufferWidth: number
  bufferHeight: number
}

export type CopyModeAction =
  | { type: "enter"; col: number; row: number; bufferWidth: number; bufferHeight: number }
  | { type: "exit" }
  | { type: "move"; direction: "up" | "down" | "left" | "right" }
  | { type: "moveWordForward"; buffer?: { getCell(col: number, row: number): { char: string } } }
  | { type: "moveWordBackward"; buffer?: { getCell(col: number, row: number): { char: string } } }
  | { type: "moveToLineStart" }
  | { type: "moveToLineEnd" }
  | { type: "visual" }
  | { type: "visualLine" }
  | { type: "yank" }

export type CopyModeEffect =
  | { type: "render" }
  | { type: "copy"; anchor: CopyModePosition; head: CopyModePosition; lineWise: boolean }
  | { type: "setSelection"; anchor: CopyModePosition; head: CopyModePosition; lineWise: boolean }

// ============================================================================
// State
// ============================================================================

export function createCopyModeState(): CopyModeState {
  return {
    active: false,
    cursor: { col: 0, row: 0 },
    visual: false,
    visualLine: false,
    anchor: null,
    bufferWidth: 0,
    bufferHeight: 0,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function clampCol(col: number, width: number): number {
  return Math.max(0, Math.min(col, width - 1))
}

function clampRow(row: number, height: number): number {
  return Math.max(0, Math.min(row, height - 1))
}

function moveCursor(state: CopyModeState, direction: "up" | "down" | "left" | "right"): CopyModePosition {
  const { col, row } = state.cursor
  switch (direction) {
    case "up":
      return { col, row: clampRow(row - 1, state.bufferHeight) }
    case "down":
      return { col, row: clampRow(row + 1, state.bufferHeight) }
    case "left":
      return { col: clampCol(col - 1, state.bufferWidth), row }
    case "right":
      return { col: clampCol(col + 1, state.bufferWidth), row }
  }
}

// ============================================================================
// Update
// ============================================================================

export function copyModeUpdate(action: CopyModeAction, state: CopyModeState): [CopyModeState, CopyModeEffect[]] {
  switch (action.type) {
    case "enter": {
      return [
        {
          active: true,
          cursor: { col: action.col, row: action.row },
          visual: false,
          visualLine: false,
          anchor: null,
          bufferWidth: action.bufferWidth,
          bufferHeight: action.bufferHeight,
        },
        [{ type: "render" }],
      ]
    }

    case "exit": {
      return [createCopyModeState(), [{ type: "render" }]]
    }

    case "move": {
      if (!state.active) return [state, []]
      const cursor = moveCursor(state, action.direction)
      const effects: CopyModeEffect[] = [{ type: "render" }]

      // Update selection rendering when in visual mode
      if ((state.visual || state.visualLine) && state.anchor) {
        effects.push({
          type: "setSelection",
          anchor: state.anchor,
          head: cursor,
          lineWise: state.visualLine,
        })
      }

      return [{ ...state, cursor }, effects]
    }

    case "moveWordForward": {
      if (!state.active) return [state, []]
      // Simple word-forward: skip non-word chars, then word chars
      let { col, row } = state.cursor
      const buffer = action.buffer
      if (!buffer) return [state, []]

      const isWord = (c: number, r: number) => /\w/.test(buffer.getCell(c, r).char)

      // Skip current word chars
      while (col < state.bufferWidth - 1 && isWord(col, row)) col++
      // Skip non-word chars
      while (col < state.bufferWidth - 1 && !isWord(col, row)) col++

      const cursor = { col, row }
      const effects: CopyModeEffect[] = [{ type: "render" }]
      if ((state.visual || state.visualLine) && state.anchor) {
        effects.push({ type: "setSelection", anchor: state.anchor, head: cursor, lineWise: state.visualLine })
      }
      return [{ ...state, cursor }, effects]
    }

    case "moveWordBackward": {
      if (!state.active) return [state, []]
      let { col, row } = state.cursor
      const buffer = action.buffer
      if (!buffer) return [state, []]

      const isWord = (c: number, r: number) => /\w/.test(buffer.getCell(c, r).char)

      // Skip non-word chars backwards
      while (col > 0 && !isWord(col - 1, row)) col--
      // Skip word chars backwards
      while (col > 0 && isWord(col - 1, row)) col--

      const cursor = { col, row }
      const effects: CopyModeEffect[] = [{ type: "render" }]
      if ((state.visual || state.visualLine) && state.anchor) {
        effects.push({ type: "setSelection", anchor: state.anchor, head: cursor, lineWise: state.visualLine })
      }
      return [{ ...state, cursor }, effects]
    }

    case "moveToLineStart": {
      if (!state.active) return [state, []]
      const cursor = { col: 0, row: state.cursor.row }
      const effects: CopyModeEffect[] = [{ type: "render" }]
      if ((state.visual || state.visualLine) && state.anchor) {
        effects.push({ type: "setSelection", anchor: state.anchor, head: cursor, lineWise: state.visualLine })
      }
      return [{ ...state, cursor }, effects]
    }

    case "moveToLineEnd": {
      if (!state.active) return [state, []]
      const cursor = { col: state.bufferWidth - 1, row: state.cursor.row }
      const effects: CopyModeEffect[] = [{ type: "render" }]
      if ((state.visual || state.visualLine) && state.anchor) {
        effects.push({ type: "setSelection", anchor: state.anchor, head: cursor, lineWise: state.visualLine })
      }
      return [{ ...state, cursor }, effects]
    }

    case "visual": {
      if (!state.active) return [state, []]

      if (state.visual) {
        // Toggle off: clear visual mode and anchor
        return [{ ...state, visual: false, anchor: null }, [{ type: "render" }]]
      }

      // Toggle on: set anchor at current cursor
      const anchor = { ...state.cursor }
      return [
        { ...state, visual: true, visualLine: false, anchor },
        [{ type: "render" }, { type: "setSelection", anchor, head: state.cursor, lineWise: false }],
      ]
    }

    case "visualLine": {
      if (!state.active) return [state, []]

      if (state.visualLine) {
        // Toggle off
        return [{ ...state, visualLine: false, anchor: null }, [{ type: "render" }]]
      }

      // Toggle on: set anchor at current cursor position
      const anchor = { ...state.cursor }
      return [
        { ...state, visualLine: true, visual: false, anchor },
        [{ type: "render" }, { type: "setSelection", anchor, head: state.cursor, lineWise: true }],
      ]
    }

    case "yank": {
      if (!state.active) return [state, []]

      if ((state.visual || state.visualLine) && state.anchor) {
        const effects: CopyModeEffect[] = [
          { type: "copy", anchor: state.anchor, head: state.cursor, lineWise: state.visualLine },
          { type: "render" },
        ]
        return [createCopyModeState(), effects]
      }

      // If not in visual mode, just exit
      return [createCopyModeState(), [{ type: "render" }]]
    }
  }
}
