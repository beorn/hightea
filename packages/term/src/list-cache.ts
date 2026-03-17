/**
 * Domain object for ListView's `cache` prop.
 *
 * Tracks which items are cacheable (frozen) and manages the contiguous
 * frozen prefix. The actual caching/virtualization happens in ListView
 * by slicing items — ListCache just tracks keys and indices.
 *
 * Three tiers of usage:
 * 1. `cache={true}` — defaults
 * 2. `cache={{ isCacheable: (m) => m.done, capacity: 10_000, overscan: 5 }}` — configured
 * 3. `cache={createListCache(...)}` — external domain object
 */

export interface ListCacheConfig<T = unknown> {
  /** Predicate: when true, item is eligible for caching (frozen) */
  isCacheable?: (item: T, index: number) => boolean
  /** Max items in cache. Default: 10_000 */
  capacity?: number
  /** Extra items to keep rendered beyond viewport. Default: 5 */
  overscan?: number
}

export interface ListCacheEntry {
  key: string | number
  index: number
}

export interface ListCache<T = unknown> {
  /** The config this cache was created with */
  readonly config: Required<ListCacheConfig<T>>

  /** Number of items currently cached (frozen contiguous prefix) */
  readonly frozenCount: number

  /** Update the cache with new items. Returns the new frozen count.
   * Computes contiguous frozen prefix from isCacheable predicate. */
  update(items: T[], getKey: (item: T, index: number) => string | number): number

  /** Get a cached entry by key */
  getEntry(key: string | number): ListCacheEntry | undefined

  /** Clear all cached entries */
  clear(): void

  /** Invalidate all entries (marks them for re-evaluation) */
  invalidateAll(): void

  /** Imperatively freeze a specific item by key */
  freeze(key: string | number): void

  /** Subscribe to lifecycle events */
  on(event: "freeze" | "evict", handler: (entry: ListCacheEntry) => void): () => void
}

const DEFAULT_CAPACITY = 10_000
const DEFAULT_OVERSCAN = 5

/** Type guard: is this a ListCache domain object? */
export function isListCache(value: unknown): value is ListCache {
  if (value == null || typeof value !== "object") return false
  const obj = value as Record<string, unknown>
  return typeof obj.frozenCount === "number" && typeof obj.update === "function"
}

/** Create a ListCache domain object */
export function createListCache<T>(config?: ListCacheConfig<T>): ListCache<T> {
  const resolved: Required<ListCacheConfig<T>> = {
    isCacheable: config?.isCacheable ?? (() => true),
    capacity: config?.capacity ?? DEFAULT_CAPACITY,
    overscan: config?.overscan ?? DEFAULT_OVERSCAN,
  }

  // Key → entry lookup
  let entries = new Map<string | number, ListCacheEntry>()
  // Manually frozen keys (via imperative freeze())
  let manuallyFrozen = new Set<string | number>()
  // Current frozen prefix length
  let _frozenCount = 0

  // Event listeners
  const listeners = {
    freeze: new Set<(entry: ListCacheEntry) => void>(),
    evict: new Set<(entry: ListCacheEntry) => void>(),
  }

  function emit(event: "freeze" | "evict", entry: ListCacheEntry): void {
    for (const handler of listeners[event]) {
      handler(entry)
    }
  }

  function evictOldest(): void {
    while (entries.size > resolved.capacity) {
      // Evict the first (oldest) entry
      const first = entries.entries().next()
      if (first.done) break
      const [key, entry] = first.value
      entries.delete(key)
      manuallyFrozen.delete(key)
      emit("evict", entry)
    }
  }

  return {
    get config(): Required<ListCacheConfig<T>> {
      return resolved
    },

    get frozenCount(): number {
      return _frozenCount
    },

    update(items: T[], getKey: (item: T, index: number) => string | number): number {
      const prevFrozenCount = _frozenCount

      // Compute contiguous frozen prefix: items from index 0 where either
      // isCacheable returns true OR the key is in the manually-frozen set
      let newFrozenCount = 0
      for (let i = 0; i < items.length; i++) {
        const key = getKey(items[i]!, i)
        const cacheable = resolved.isCacheable(items[i]!, i) || manuallyFrozen.has(key)
        if (!cacheable) break
        newFrozenCount = i + 1
      }

      // Update entries for the frozen prefix
      const newEntries = new Map<string | number, ListCacheEntry>()
      for (let i = 0; i < newFrozenCount; i++) {
        const key = getKey(items[i]!, i)
        const entry: ListCacheEntry = { key, index: i }
        newEntries.set(key, entry)
      }

      // Fire evict events for entries that were in the old map but not in the new one
      for (const [key, entry] of entries) {
        if (!newEntries.has(key)) {
          emit("evict", entry)
        }
      }

      // Fire freeze events for newly frozen entries (not in old map)
      for (let i = prevFrozenCount; i < newFrozenCount; i++) {
        const key = getKey(items[i]!, i)
        const entry = newEntries.get(key)!
        if (!entries.has(key)) {
          emit("freeze", entry)
        }
      }

      entries = newEntries
      _frozenCount = newFrozenCount

      evictOldest()

      return _frozenCount
    },

    getEntry(key: string | number): ListCacheEntry | undefined {
      return entries.get(key)
    },

    clear(): void {
      for (const [, entry] of entries) {
        emit("evict", entry)
      }
      entries = new Map()
      manuallyFrozen = new Set()
      _frozenCount = 0
    },

    invalidateAll(): void {
      // Mark all entries for re-evaluation by clearing and resetting frozen count.
      // Entries stay in the map but frozenCount resets — next update() recomputes.
      _frozenCount = 0
      entries = new Map()
    },

    freeze(key: string | number): void {
      manuallyFrozen.add(key)
    },

    on(event: "freeze" | "evict", handler: (entry: ListCacheEntry) => void): () => void {
      listeners[event].add(handler)
      return () => {
        listeners[event].delete(handler)
      }
    },
  }
}

/**
 * Resolve cache prop to a ListCache.
 * - true -> createListCache() with defaults
 * - config object (no frozenCount property) -> createListCache(config)
 * - ListCache instance -> use as-is
 */
export function resolveListCache<T>(prop: true | ListCacheConfig<T> | ListCache<T>): ListCache<T> {
  if (prop === true) {
    return createListCache<T>()
  }
  if (isListCache(prop)) {
    return prop as ListCache<T>
  }
  return createListCache<T>(prop as ListCacheConfig<T>)
}
