/**
 * ListNavigator — Domain object for cursor/navigation state in ListView.
 *
 * Three usage tiers:
 * 1. `navigator={true}` — default navigation (j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel, Enter)
 * 2. `navigator={{ onActivate: (key, i) => ... }}` — configured callbacks
 * 3. `navigator={createListNavigator(...)}` — external domain object with imperative API
 */

// ============================================================================
// Types
// ============================================================================

export interface ListNavigatorConfig {
  /** Called when Enter pressed on cursor item. Receives key and index. */
  onActivate?: (key: string | number, index: number) => void
  /** Called when cursor position changes */
  onCursorChange?: (key: string | number, index: number) => void
  /** Initial cursor index. Default: 0 */
  initialIndex?: number
}

export interface ListNavigator {
  /** The config */
  readonly config: ListNavigatorConfig

  /** Current cursor index */
  readonly cursorIndex: number

  /** Current cursor key (if items have been synced) */
  readonly cursorKey: string | number | undefined

  /** Total item count (set via sync) */
  readonly itemCount: number

  /** Move cursor to item with given key */
  moveTo(key: string | number): void

  /** Move cursor to specific index */
  moveToIndex(index: number): void

  /** Move cursor by delta (+1 = down, -1 = up) */
  moveBy(delta: number): void

  /** Move to first item */
  moveToFirst(): void

  /** Move to last item */
  moveToLast(): void

  /** Page down by given page size */
  pageDown(pageSize: number): void

  /** Page up by given page size */
  pageUp(pageSize: number): void

  /** Trigger activation on current cursor item */
  activate(): void

  /**
   * Sync with items list. Updates key<->index mapping.
   * Handles cursor-disappears: if current cursor key is removed,
   * moves to nearest surviving item.
   */
  sync(items: readonly unknown[], getKey: (item: unknown, index: number) => string | number): void

  /** Subscribe to events. Returns unsubscribe function. */
  on(event: "cursor" | "activate", handler: (...args: unknown[]) => void): () => void
}

// ============================================================================
// Type Guard
// ============================================================================

/** Type guard: checks for cursorIndex (number), moveBy (function), sync (function) */
export function isListNavigator(value: unknown): value is ListNavigator {
  if (value == null || typeof value !== "object") return false
  const obj = value as Record<string, unknown>
  return typeof obj.cursorIndex === "number" && typeof obj.moveBy === "function" && typeof obj.sync === "function"
}

// ============================================================================
// Factory
// ============================================================================

type EventName = "cursor" | "activate"

/** Create a ListNavigator with optional config */
export function createListNavigator(config: ListNavigatorConfig = {}): ListNavigator {
  let cursorIndex = config.initialIndex ?? 0
  let itemCount = 0

  const keyToIndex = new Map<string | number, number>()
  const indexToKey = new Map<number, string | number>()
  const listeners = new Map<EventName, Set<(...args: unknown[]) => void>>()

  function emit(event: EventName, ...args: unknown[]): void {
    const set = listeners.get(event)
    if (set) {
      for (const handler of set) {
        handler(...args)
      }
    }
  }

  function clamp(index: number): number {
    if (itemCount === 0) return 0
    return Math.max(0, Math.min(index, itemCount - 1))
  }

  function setCursor(newIndex: number): void {
    const clamped = clamp(newIndex)
    if (clamped === cursorIndex) return
    cursorIndex = clamped
    const key = indexToKey.get(cursorIndex)
    if (key !== undefined) {
      config.onCursorChange?.(key, cursorIndex)
      emit("cursor", key, cursorIndex)
    }
  }

  const navigator: ListNavigator = {
    get config(): ListNavigatorConfig {
      return config
    },

    get cursorIndex(): number {
      return cursorIndex
    },

    get cursorKey(): string | number | undefined {
      return indexToKey.get(cursorIndex)
    },

    get itemCount(): number {
      return itemCount
    },

    moveTo(key: string | number): void {
      const index = keyToIndex.get(key)
      if (index !== undefined) {
        setCursor(index)
      }
    },

    moveToIndex(index: number): void {
      setCursor(index)
    },

    moveBy(delta: number): void {
      setCursor(cursorIndex + delta)
    },

    moveToFirst(): void {
      setCursor(0)
    },

    moveToLast(): void {
      setCursor(itemCount - 1)
    },

    pageDown(pageSize: number): void {
      setCursor(cursorIndex + pageSize)
    },

    pageUp(pageSize: number): void {
      setCursor(cursorIndex - pageSize)
    },

    activate(): void {
      const key = indexToKey.get(cursorIndex)
      if (key !== undefined) {
        config.onActivate?.(key, cursorIndex)
        emit("activate", key, cursorIndex)
      }
    },

    sync(items: readonly unknown[], getKey: (item: unknown, index: number) => string | number): void {
      const previousKey = indexToKey.get(cursorIndex)

      // Rebuild maps
      keyToIndex.clear()
      indexToKey.clear()
      itemCount = items.length

      for (let i = 0; i < items.length; i++) {
        const key = getKey(items[i]!, i)
        keyToIndex.set(key, i)
        indexToKey.set(i, key)
      }

      if (itemCount === 0) {
        cursorIndex = 0
        return
      }

      // Cursor-disappears handling
      if (previousKey !== undefined && keyToIndex.has(previousKey)) {
        // Key still exists — follow it to its new position
        const newIndex = keyToIndex.get(previousKey)!
        if (newIndex !== cursorIndex) {
          cursorIndex = newIndex
          const key = indexToKey.get(cursorIndex)
          if (key !== undefined) {
            config.onCursorChange?.(key, cursorIndex)
            emit("cursor", key, cursorIndex)
          }
        }
      } else {
        // Key is gone — find nearest surviving index
        // Prefer same index, then scan outward
        const oldIndex = cursorIndex
        const clamped = clamp(oldIndex)
        if (clamped !== cursorIndex) {
          cursorIndex = clamped
          const key = indexToKey.get(cursorIndex)
          if (key !== undefined) {
            config.onCursorChange?.(key, cursorIndex)
            emit("cursor", key, cursorIndex)
          }
        } else {
          cursorIndex = clamped
        }
      }
    },

    on(event: EventName, handler: (...args: unknown[]) => void): () => void {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(handler)
      return () => {
        set!.delete(handler)
      }
    },
  }

  return navigator
}

// ============================================================================
// Resolver
// ============================================================================

/**
 * Resolve navigator prop to a ListNavigator instance:
 * - `true` -> createListNavigator() with defaults
 * - config object (has onActivate or onCursorChange but is not already a ListNavigator) -> createListNavigator(config)
 * - ListNavigator instance -> use as-is
 */
export function resolveListNavigator(prop: true | ListNavigatorConfig | ListNavigator): ListNavigator {
  if (prop === true) {
    return createListNavigator()
  }
  if (isListNavigator(prop)) {
    return prop
  }
  return createListNavigator(prop)
}
