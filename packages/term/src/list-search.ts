/**
 * Domain object that manages search state for ListView's `search` prop.
 *
 * Three tiers:
 * 1. `search={true}` — default search (Ctrl+F open, Escape close, Enter/Shift+Enter navigate)
 * 2. `search={{ getText: (m) => m.content }}` — configured with text extraction
 * 3. `search={createListSearch(...)}` — external domain object
 *
 * Internally reuses the `searchUpdate` TEA state machine from search-overlay,
 * adapted to item-level matching instead of row-level.
 */

import { type SearchAction, type SearchState, createSearchState, searchUpdate } from "./search-overlay"

export interface ListSearchConfig<T = unknown> {
  /** Extract searchable text from an item. Default: String(item) */
  getText?: (item: T) => string
}

export interface ListSearchMatch {
  /** Index of the matching item */
  itemIndex: number
  /** Key of the matching item */
  itemKey: string | number
}

export interface ListSearch<T = unknown> {
  /** The config */
  readonly config: ListSearchConfig<T>

  /** Whether search is currently active (overlay visible) */
  readonly isActive: boolean

  /** Current search query */
  readonly query: string

  /** All matching items */
  readonly matches: readonly ListSearchMatch[]

  /** Index of current match in matches array (-1 = none) */
  readonly currentMatchIndex: number

  /** The current match (convenience) */
  readonly currentMatch: ListSearchMatch | undefined

  /** Open search */
  open(): void

  /** Close search and clear results */
  close(): void

  /** Execute search with given query */
  search(query: string): void

  /** Jump to next match */
  next(): void

  /** Jump to previous match */
  prev(): void

  /** Type a character (appended to query, triggers re-search) */
  input(char: string): void

  /** Delete character before cursor */
  backspace(): void

  /** Update the items being searched (called by ListView on render).
   * Re-runs search if active. */
  sync(items: readonly T[], getKey: (item: T, index: number) => string | number): void

  /** Subscribe to state changes */
  subscribe(listener: () => void): () => void
}

/** Type guard */
export function isListSearch(value: unknown): value is ListSearch {
  if (value == null || typeof value !== "object") return false
  const obj = value as Record<string, unknown>
  return typeof obj.isActive === "boolean" && typeof obj.search === "function" && typeof obj.sync === "function"
}

/** Create a ListSearch */
export function createListSearch<T>(config?: ListSearchConfig<T>): ListSearch<T> {
  const resolvedConfig: ListSearchConfig<T> = config ?? {}
  const getText = resolvedConfig.getText ?? ((item: T) => String(item))

  let searchState: SearchState = createSearchState()
  let items: readonly T[] = []
  let getKey: (item: T, index: number) => string | number = (_item, index) => index
  let itemMatches: ListSearchMatch[] = []
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function runItemSearch(query: string): ListSearchMatch[] {
    if (!query) return []
    const lowerQuery = query.toLowerCase()
    const result: ListSearchMatch[] = []
    for (let i = 0; i < items.length; i++) {
      const text = getText(items[i]!).toLowerCase()
      if (text.includes(lowerQuery)) {
        result.push({ itemIndex: i, itemKey: getKey(items[i]!, i) })
      }
    }
    return result
  }

  /** Adapter: creates a searchFn compatible with searchUpdate that maps item matches to SearchMatch[] */
  function createSearchFn(query: string) {
    itemMatches = runItemSearch(query)
    // Map item matches to SearchMatch format (row = itemIndex, cols unused but required)
    return itemMatches.map((m) => ({ row: m.itemIndex, startCol: 0, endCol: 0 }))
  }

  function dispatch(action: SearchAction): void {
    const searchFn = (query: string) => createSearchFn(query)
    const [nextState] = searchUpdate(action, searchState, searchFn)
    searchState = nextState
    notify()
  }

  const instance: ListSearch<T> = {
    get config() {
      return resolvedConfig
    },

    get isActive() {
      return searchState.active
    },

    get query() {
      return searchState.query
    },

    get matches(): readonly ListSearchMatch[] {
      return itemMatches
    },

    get currentMatchIndex() {
      return searchState.currentMatch
    },

    get currentMatch() {
      const idx = searchState.currentMatch
      if (idx < 0 || idx >= itemMatches.length) return undefined
      return itemMatches[idx]
    },

    open() {
      dispatch({ type: "open" })
    },

    close() {
      itemMatches = []
      dispatch({ type: "close" })
    },

    search(query: string) {
      // Open if not active, then set the full query
      if (!searchState.active) {
        dispatch({ type: "open" })
      }
      // Clear current query and input the new one character by character
      // would be inefficient; instead, directly compute the search and update state
      itemMatches = runItemSearch(query)
      const matches = itemMatches.map((m) => ({ row: m.itemIndex, startCol: 0, endCol: 0 }))
      searchState = {
        ...searchState,
        query,
        cursorPosition: query.length,
        matches,
        currentMatch: matches.length > 0 ? 0 : -1,
      }
      notify()
    },

    next() {
      dispatch({ type: "nextMatch" })
    },

    prev() {
      dispatch({ type: "prevMatch" })
    },

    input(char: string) {
      dispatch({ type: "input", char })
    },

    backspace() {
      dispatch({ type: "backspace" })
    },

    sync(newItems: readonly T[], newGetKey: (item: T, index: number) => string | number) {
      items = newItems
      getKey = newGetKey
      // Re-run search if active
      if (searchState.active && searchState.query) {
        itemMatches = runItemSearch(searchState.query)
        const matches = itemMatches.map((m) => ({ row: m.itemIndex, startCol: 0, endCol: 0 }))
        const currentMatch = matches.length > 0 ? Math.min(searchState.currentMatch, matches.length - 1) : -1
        searchState = {
          ...searchState,
          matches,
          currentMatch: currentMatch < 0 ? (matches.length > 0 ? 0 : -1) : currentMatch,
        }
        notify()
      }
    },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  return instance
}

/** Resolve search prop:
 * - true -> createListSearch() with defaults
 * - config object (has getText but no isActive) -> createListSearch(config)
 * - ListSearch instance -> use as-is */
export function resolveListSearch<T>(prop: true | ListSearchConfig<T> | ListSearch<T>): ListSearch<T> {
  if (prop === true) {
    return createListSearch<T>()
  }
  if (isListSearch(prop)) {
    return prop as ListSearch<T>
  }
  // Config object
  return createListSearch<T>(prop as ListSearchConfig<T>)
}
