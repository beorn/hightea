/**
 * ListNavigator domain object tests.
 */

import { describe, test, expect, vi } from "vitest"
import { createListNavigator, isListNavigator, resolveListNavigator } from "../../packages/term/src/list-navigator"

interface Item {
  id: string
  name: string
}

const items: Item[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Charlie" },
  { id: "d", name: "Delta" },
  { id: "e", name: "Echo" },
]

const getKey = (item: unknown, _i: number) => (item as Item).id

describe("createListNavigator", () => {
  test("initial cursor is 0", () => {
    const nav = createListNavigator()
    expect(nav.cursorIndex).toBe(0)
  })

  test("initialIndex sets starting cursor", () => {
    const nav = createListNavigator({ initialIndex: 3 })
    expect(nav.cursorIndex).toBe(3)
  })

  test("sync builds key↔index maps", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    expect(nav.itemCount).toBe(5)
    expect(nav.cursorKey).toBe("a")
  })

  test("moveBy adjusts cursor", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveBy(2)
    expect(nav.cursorIndex).toBe(2)
    expect(nav.cursorKey).toBe("c")
  })

  test("moveBy clamps to bounds", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveBy(-5)
    expect(nav.cursorIndex).toBe(0)
    nav.moveBy(100)
    expect(nav.cursorIndex).toBe(4)
  })

  test("moveTo navigates by key", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveTo("d")
    expect(nav.cursorIndex).toBe(3)
    expect(nav.cursorKey).toBe("d")
  })

  test("moveTo with unknown key is a no-op", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveTo("unknown")
    expect(nav.cursorIndex).toBe(0)
  })

  test("moveToFirst and moveToLast", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveToLast()
    expect(nav.cursorIndex).toBe(4)
    nav.moveToFirst()
    expect(nav.cursorIndex).toBe(0)
  })

  test("pageDown and pageUp", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.pageDown(3)
    expect(nav.cursorIndex).toBe(3)
    nav.pageUp(2)
    expect(nav.cursorIndex).toBe(1)
  })

  test("activate calls onActivate", () => {
    const onActivate = vi.fn()
    const nav = createListNavigator({ onActivate })
    nav.sync(items, getKey)
    nav.moveBy(2)
    nav.activate()
    expect(onActivate).toHaveBeenCalledWith("c", 2)
  })

  test("cursor-disappears: key removed → nearest survivor", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveBy(2) // cursor at "c" (index 2)
    expect(nav.cursorKey).toBe("c")

    // Remove "c" from items
    const filtered = items.filter((i) => i.id !== "c")
    nav.sync(filtered, getKey)
    // Cursor should clamp to index 2 → "d" (new index 2)
    expect(nav.cursorIndex).toBe(2)
    expect(nav.cursorKey).toBe("d")
  })

  test("cursor-disappears: key moved → follows", () => {
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.moveTo("c") // cursor at "c" (index 2)

    // Reverse the list
    const reversed = [...items].reverse()
    nav.sync(reversed, getKey)
    // "c" is now at index 2 in reversed list (e, d, c, b, a)
    expect(nav.cursorKey).toBe("c")
    expect(nav.cursorIndex).toBe(2)
  })

  test("on('cursor') fires on cursor change", () => {
    const handler = vi.fn()
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.on("cursor", handler)
    nav.moveBy(1)
    expect(handler).toHaveBeenCalledWith("b", 1)
  })

  test("on('activate') fires on activation", () => {
    const handler = vi.fn()
    const nav = createListNavigator()
    nav.sync(items, getKey)
    nav.on("activate", handler)
    nav.activate()
    expect(handler).toHaveBeenCalledWith("a", 0)
  })

  test("unsubscribe stops events", () => {
    const handler = vi.fn()
    const nav = createListNavigator()
    nav.sync(items, getKey)
    const unsub = nav.on("cursor", handler)
    unsub()
    nav.moveBy(1)
    expect(handler).not.toHaveBeenCalled()
  })

  test("empty items: cursor stays at 0", () => {
    const nav = createListNavigator()
    nav.sync([], getKey)
    expect(nav.cursorIndex).toBe(0)
    expect(nav.itemCount).toBe(0)
  })
})

describe("isListNavigator", () => {
  test("returns true for ListNavigator", () => {
    expect(isListNavigator(createListNavigator())).toBe(true)
  })

  test("returns false for config", () => {
    expect(isListNavigator({ onActivate: () => {} })).toBe(false)
  })

  test("returns false for primitives", () => {
    expect(isListNavigator(true)).toBe(false)
    expect(isListNavigator(null)).toBe(false)
  })
})

describe("resolveListNavigator", () => {
  test("true creates default navigator", () => {
    const nav = resolveListNavigator(true)
    expect(isListNavigator(nav)).toBe(true)
  })

  test("config creates configured navigator", () => {
    const onActivate = vi.fn()
    const nav = resolveListNavigator({ onActivate })
    nav.sync(items, getKey)
    nav.activate()
    expect(onActivate).toHaveBeenCalled()
  })

  test("domain object passes through", () => {
    const original = createListNavigator()
    expect(resolveListNavigator(original)).toBe(original)
  })
})
