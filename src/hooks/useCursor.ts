/**
 * useCursor - Show and position the terminal's blinking cursor.
 *
 * Maps component-relative (col, row) to absolute terminal coordinates
 * using useScreenRectCallback. Global last-writer-wins: only one cursor
 * can be active at a time (the terminal has one hardware cursor).
 */

import { useCallback, useEffect, useRef } from "react"
import { useScreenRectCallback } from "./useLayout.js"

// ============================================================================
// Types
// ============================================================================

export interface CursorPosition {
  /** Column offset within the component (0-indexed) */
  col: number
  /** Row offset within the component (0-indexed) */
  row: number
  /** Whether the cursor should be visible. Default: true */
  visible?: boolean
}

export interface CursorState {
  /** Absolute terminal X position (0-indexed) */
  x: number
  /** Absolute terminal Y position (0-indexed) */
  y: number
  /** Whether cursor is visible */
  visible: boolean
}

// ============================================================================
// Global Cursor State
// ============================================================================

// Last-writer-wins: the most recent useCursor call with visible=true
// determines cursor position.
let _globalCursorState: CursorState | null = null
let _cursorListeners = new Set<() => void>()

function setCursorState(state: CursorState | null): void {
  _globalCursorState = state
  for (const listener of _cursorListeners) listener()
}

function getCursorState(): CursorState | null {
  return _globalCursorState
}

function subscribeCursor(listener: () => void): () => void {
  _cursorListeners.add(listener)
  return () => {
    _cursorListeners.delete(listener)
  }
}

/** For testing -- reset global state between tests. */
export function resetCursorState(): void {
  _globalCursorState = null
  _cursorListeners = new Set()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Show and position the terminal's blinking cursor within this component.
 *
 * The cursor position is relative to the component's screen position.
 * Only one cursor can be active -- last caller with visible=true wins.
 */
export function useCursor(position: CursorPosition): void {
  const { col, row, visible = true } = position

  // Keep current args in refs so the callback always reads fresh values
  const colRef = useRef(col)
  const rowRef = useRef(row)
  const visibleRef = useRef(visible)
  colRef.current = col
  rowRef.current = row
  visibleRef.current = visible

  // Called synchronously during layout (useLayoutEffect) whenever
  // the component's screen position changes.
  useScreenRectCallback(
    useCallback((rect) => {
      if (!visibleRef.current) {
        return
      }
      setCursorState({
        x: rect.x + colRef.current,
        y: rect.y + rowRef.current,
        visible: true,
      })
    }, []),
  )

  // On unmount or when visible becomes false, clear cursor state
  useEffect(() => {
    if (!visible) {
      // If we are hiding, clear state now
      const current = getCursorState()
      if (current) {
        setCursorState(null)
      }
    }

    return () => {
      // On unmount, clear cursor state
      setCursorState(null)
    }
  }, [visible])
}

// ============================================================================
// Exports for scheduler integration
// ============================================================================

export { getCursorState, subscribeCursor }
