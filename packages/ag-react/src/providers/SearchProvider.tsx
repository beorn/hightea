/**
 * SearchProvider — app-global search with pluggable Searchable registration.
 *
 * Components (e.g., ListView) register as searchable. SearchBar reads search state.
 * Ctrl+F opens search on the focused searchable. Pluggable: any component can
 * register by calling `registerSearchable()` from the context.
 *
 * Usage:
 * ```tsx
 * <SearchProvider>
 *   <App />
 *   <SearchBar />
 * </SearchProvider>
 * ```
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { type SearchState, type SearchMatch, createSearchState, searchUpdate } from "@silvery/ag-term/search-overlay"
import { useInput } from "../hooks/useInput"
import type { ReactNode, ReactElement } from "react"

// ============================================================================
// Searchable interface — what components register
// ============================================================================

/** Minimal interface for a searchable component. */
export interface Searchable {
  search(query: string): SearchMatch[]
  reveal(match: SearchMatch): void
}

// ============================================================================
// Context types
// ============================================================================

export interface SearchContextValue {
  /** Whether the search bar is currently open */
  isActive: boolean
  /** The current search query */
  query: string
  /** All matches found by the current query */
  matches: SearchMatch[]
  /** Index of the currently highlighted match (-1 = none) */
  currentMatch: number
  /** Cursor position within the query string */
  cursorPosition: number
  /** Open the search bar */
  open(): void
  /** Close the search bar and clear results */
  close(): void
  /** Jump to the next match */
  next(): void
  /** Jump to the previous match */
  prev(): void
  /** Type a character into the search query */
  input(char: string): void
  /** Delete the character before the cursor */
  backspace(): void
  /** Move the query cursor left */
  cursorLeft(): void
  /** Move the query cursor right */
  cursorRight(): void
  /** Register a searchable component. Returns unregister function. */
  registerSearchable(id: string, searchable: Searchable): () => void
  /** Set which searchable is focused (for multi-pane routing). */
  setFocused(id: string | null): void
}

// ============================================================================
// Context
// ============================================================================

const SearchContext = createContext<SearchContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function SearchProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<SearchState>(createSearchState)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const searchablesRef = useRef(new Map<string, Searchable>())

  const getActiveSearchable = useCallback((): Searchable | null => {
    const id = activeId ?? focusedId
    if (!id) {
      // Fall back to the only registered searchable (single-pane apps)
      const entries = searchablesRef.current
      if (entries.size === 1) return entries.values().next().value!
      return null
    }
    return searchablesRef.current.get(id) ?? null
  }, [activeId, focusedId])

  const getSearchFn = useCallback(() => {
    const searchable = getActiveSearchable()
    if (!searchable) return undefined
    return (query: string) => searchable.search(query)
  }, [getActiveSearchable])

  const handleEffects = useCallback(
    (effects: Array<{ type: string; row?: number; startCol?: number; endCol?: number }>) => {
      const searchable = getActiveSearchable()
      if (!searchable) return
      for (const eff of effects) {
        if (eff.type === "scrollTo" && eff.row !== undefined) {
          searchable.reveal({ row: eff.row, startCol: eff.startCol ?? 0, endCol: eff.endCol ?? 0 })
        }
      }
    },
    [getActiveSearchable],
  )

  const registerSearchable = useCallback((id: string, searchable: Searchable): (() => void) => {
    searchablesRef.current.set(id, searchable)
    return () => {
      searchablesRef.current.delete(id)
    }
  }, [])

  const setFocused = useCallback((id: string | null) => {
    setFocusedId(id)
  }, [])

  const open = useCallback(() => {
    // Lock to current focused searchable when opening
    setActiveId(focusedId)
    setState((prev) => {
      const [next] = searchUpdate({ type: "open" }, prev)
      return next
    })
  }, [focusedId])

  const close = useCallback(() => {
    setActiveId(null)
    setState((prev) => {
      const [next] = searchUpdate({ type: "close" }, prev)
      return next
    })
  }, [])

  const next = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "nextMatch" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

  const prev = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "prevMatch" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

  const input = useCallback(
    (char: string) => {
      setState((prev) => {
        const searchFn = getSearchFn()
        const [next, effects] = searchUpdate({ type: "input", char }, prev, searchFn)
        handleEffects(effects)
        return next
      })
    },
    [getSearchFn, handleEffects],
  )

  const backspace = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "backspace" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

  const cursorLeft = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorLeft" }, prev)
      return next
    })
  }, [])

  const cursorRight = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorRight" }, prev)
      return next
    })
  }, [])

  const value = useMemo<SearchContextValue>(
    () => ({
      isActive: state.active,
      query: state.query,
      matches: state.matches,
      currentMatch: state.currentMatch,
      cursorPosition: state.cursorPosition,
      open,
      close,
      next,
      prev,
      input,
      backspace,
      cursorLeft,
      cursorRight,
      registerSearchable,
      setFocused,
    }),
    [state, open, close, next, prev, input, backspace, cursorLeft, cursorRight, registerSearchable, setFocused],
  )

  return React.createElement(
    SearchContext.Provider,
    { value },
    React.createElement(SearchBindings, { ctx: value }),
    children,
  )
}

// ============================================================================
// Input Bindings
// ============================================================================

function SearchBindings({ ctx }: { ctx: SearchContextValue }) {
  useInput(
    (input, key) => {
      if (!ctx.isActive) {
        if (key.ctrl && input === "f") {
          ctx.open()
          return
        }
        return
      }
      if (key.escape) {
        ctx.close()
        return
      }
      if (key.return && !key.shift) {
        ctx.next()
        return
      }
      if (key.return && key.shift) {
        ctx.prev()
        return
      }
      if (key.backspace) {
        ctx.backspace()
        return
      }
      if (key.leftArrow) {
        ctx.cursorLeft()
        return
      }
      if (key.rightArrow) {
        ctx.cursorRight()
        return
      }
      if (input && !key.ctrl && !key.meta) {
        ctx.input(input)
        return
      }
    },
    { isActive: true },
  )
  return null
}

// ============================================================================
// Hook
// ============================================================================

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error("useSearch must be used within a SearchProvider")
  }
  return ctx
}
