/**
 * ListCache domain object tests.
 */

import { describe, test, expect, vi } from "vitest"
import { createListCache, isListCache, resolveListCache } from "../../packages/term/src/list-cache"

interface Item {
  id: string
  done: boolean
}

const items: Item[] = [
  { id: "a", done: true },
  { id: "b", done: true },
  { id: "c", done: false },
  { id: "d", done: true },
]

const getKey = (item: Item, _i: number) => item.id

describe("createListCache", () => {
  test("computes contiguous frozen prefix from isCacheable", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    const count = cache.update(items, getKey)
    expect(count).toBe(2) // a, b are done; c breaks the prefix
    expect(cache.frozenCount).toBe(2)
  })

  test("default isCacheable freezes everything", () => {
    const cache = createListCache<Item>()
    const count = cache.update(items, getKey)
    expect(count).toBe(4) // default returns true for all
  })

  test("getEntry returns cached entries", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    cache.update(items, getKey)
    expect(cache.getEntry("a")).toEqual({ key: "a", index: 0 })
    expect(cache.getEntry("b")).toEqual({ key: "b", index: 1 })
    expect(cache.getEntry("c")).toBeUndefined()
  })

  test("imperative freeze adds to frozen set", () => {
    const cache = createListCache<Item>({ isCacheable: () => false })
    cache.freeze("a")
    const count = cache.update(items, getKey)
    expect(count).toBe(1) // only 'a' frozen via manual freeze
  })

  test("clear resets everything", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    cache.update(items, getKey)
    expect(cache.frozenCount).toBe(2)
    cache.clear()
    expect(cache.frozenCount).toBe(0)
    expect(cache.getEntry("a")).toBeUndefined()
  })

  test("invalidateAll resets frozenCount", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    cache.update(items, getKey)
    expect(cache.frozenCount).toBe(2)
    cache.invalidateAll()
    expect(cache.frozenCount).toBe(0)
  })

  test("fires freeze events for new entries", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    const handler = vi.fn()
    cache.on("freeze", handler)
    cache.update(items, getKey)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith({ key: "a", index: 0 })
    expect(handler).toHaveBeenCalledWith({ key: "b", index: 1 })
  })

  test("fires evict events when entries removed", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    const handler = vi.fn()
    cache.on("evict", handler)
    cache.update(items, getKey)

    // Now update with items where 'a' is no longer done
    const newItems = [{ id: "a", done: false }, ...items.slice(1)]
    cache.update(newItems, getKey)
    expect(handler).toHaveBeenCalledWith({ key: "a", index: 0 })
  })

  test("unsubscribe stops events", () => {
    const cache = createListCache<Item>({ isCacheable: (item) => item.done })
    const handler = vi.fn()
    const unsub = cache.on("freeze", handler)
    unsub()
    cache.update(items, getKey)
    expect(handler).not.toHaveBeenCalled()
  })

  test("config is accessible", () => {
    const cache = createListCache<Item>({ capacity: 500, overscan: 10 })
    expect(cache.config.capacity).toBe(500)
    expect(cache.config.overscan).toBe(10)
  })
})

describe("isListCache", () => {
  test("returns true for ListCache", () => {
    const cache = createListCache()
    expect(isListCache(cache)).toBe(true)
  })

  test("returns false for config objects", () => {
    expect(isListCache({ isCacheable: () => true })).toBe(false)
  })

  test("returns false for primitives", () => {
    expect(isListCache(true)).toBe(false)
    expect(isListCache(null)).toBe(false)
    expect(isListCache(42)).toBe(false)
  })
})

describe("resolveListCache", () => {
  test("true creates default cache", () => {
    const cache = resolveListCache(true)
    expect(isListCache(cache)).toBe(true)
    expect(cache.config.capacity).toBe(10_000)
  })

  test("config creates configured cache", () => {
    const cache = resolveListCache({ capacity: 500 })
    expect(cache.config.capacity).toBe(500)
  })

  test("domain object passes through", () => {
    const original = createListCache({ capacity: 123 })
    const resolved = resolveListCache(original)
    expect(resolved).toBe(original)
  })
})
