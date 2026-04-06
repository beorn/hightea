/**
 * useFind — React hook for visible-buffer find.
 *
 * Manages find state via the TEA state machine from @silvery/ag-term/find.
 * Provides search, navigation, and selection integration.
 */

import { useCallback, useState } from "react"
import { type FindState, type FindEffect, createFindState, findUpdate } from "@silvery/ag-term/find"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Types
// ============================================================================

export interface UseFindOptions {
  /** Called when a scrollTo effect is emitted */
  onScrollTo?: (row: number) => void
  /** Called when a setSelection effect is emitted */
  onSetSelection?: (match: { row: number; startCol: number; endCol: number }) => void
}

export interface UseFindResult {
  /** Current find state */
  findState: FindState
  /** Search for a query in the buffer */
  search(query: string, buffer: TerminalBuffer): void
  /** Navigate to the next match */
  next(): void
  /** Navigate to the previous match */
  prev(): void
  /** Close find mode */
  close(): void
  /** Set selection to the current match */
  selectCurrent(): void
}

// ============================================================================
// Hook
// ============================================================================

export function useFind(options?: UseFindOptions): UseFindResult {
  const [state, setState] = useState<FindState>(createFindState)

  const processEffects = useCallback(
    (effects: FindEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "scrollTo":
            options?.onScrollTo?.(effect.row)
            break
          case "setSelection":
            options?.onSetSelection?.(effect.match)
            break
          // "render" effects are handled by React re-render from setState
        }
      }
    },
    [options],
  )

  const search = useCallback(
    (query: string, buffer: TerminalBuffer) => {
      setState((prev) => {
        const [next, effects] = findUpdate({ type: "search", query, buffer }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const next = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "next" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const prev = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "prev" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const close = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "close" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const selectCurrent = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "selectCurrent" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  return {
    findState: state,
    search,
    next,
    prev,
    close,
    selectCurrent,
  }
}
