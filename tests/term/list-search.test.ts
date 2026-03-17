/**
 * ListSearch domain object tests.
 */

import { describe, test, expect, vi } from "vitest"
import { createListSearch, isListSearch, resolveListSearch } from "../../packages/term/src/list-search"

interface Msg {
  id: string
  text: string
}

const messages: Msg[] = [
  { id: "1", text: "Hello world" },
  { id: "2", text: "Goodbye world" },
  { id: "3", text: "Hello again" },
  { id: "4", text: "Something else" },
]

const getKey = (item: Msg, _i: number) => item.id

describe("createListSearch", () => {
  test("starts inactive", () => {
    const search = createListSearch<Msg>()
    expect(search.isActive).toBe(false)
    expect(search.query).toBe("")
    expect(search.matches).toEqual([])
  })

  test("open activates search", () => {
    const search = createListSearch<Msg>()
    search.open()
    expect(search.isActive).toBe(true)
  })

  test("close deactivates and clears", () => {
    const search = createListSearch<Msg>()
    search.open()
    search.close()
    expect(search.isActive).toBe(false)
    expect(search.query).toBe("")
    expect(search.matches).toEqual([])
  })

  test("search finds matching items", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("hello")
    expect(search.matches).toHaveLength(2)
    expect(search.matches[0]!.itemKey).toBe("1")
    expect(search.matches[1]!.itemKey).toBe("3")
    expect(search.currentMatchIndex).toBe(0)
  })

  test("search is case-insensitive", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("GOODBYE")
    expect(search.matches).toHaveLength(1)
    expect(search.matches[0]!.itemKey).toBe("2")
  })

  test("next and prev cycle through matches", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("hello")
    expect(search.currentMatchIndex).toBe(0)
    search.next()
    expect(search.currentMatchIndex).toBe(1)
    search.next()
    expect(search.currentMatchIndex).toBe(0) // wraps around
    search.prev()
    expect(search.currentMatchIndex).toBe(1)
  })

  test("currentMatch returns the current match object", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("hello")
    expect(search.currentMatch).toEqual({ itemIndex: 0, itemKey: "1" })
    search.next()
    expect(search.currentMatch).toEqual({ itemIndex: 2, itemKey: "3" })
  })

  test("input builds query incrementally", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.open()
    search.input("h")
    search.input("e")
    search.input("l")
    expect(search.query).toBe("hel")
    expect(search.matches).toHaveLength(2) // "Hello world", "Hello again"
  })

  test("backspace removes last char", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.open()
    search.input("h")
    search.input("e")
    search.backspace()
    expect(search.query).toBe("h")
  })

  test("sync re-runs search when active", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("hello")
    expect(search.matches).toHaveLength(2)

    // Remove one matching item
    const filtered = messages.filter((m) => m.id !== "3")
    search.sync(filtered, getKey)
    expect(search.matches).toHaveLength(1)
  })

  test("subscribe notifies on state changes", () => {
    const search = createListSearch<Msg>()
    const listener = vi.fn()
    search.subscribe(listener)
    search.open()
    expect(listener).toHaveBeenCalled()
  })

  test("unsubscribe stops notifications", () => {
    const search = createListSearch<Msg>()
    const listener = vi.fn()
    const unsub = search.subscribe(listener)
    unsub()
    search.open()
    expect(listener).not.toHaveBeenCalled()
  })

  test("default getText uses String()", () => {
    const search = createListSearch<string>()
    search.sync(["hello world", "goodbye"], (item, i) => i)
    search.search("hello")
    expect(search.matches).toHaveLength(1)
    expect(search.matches[0]!.itemIndex).toBe(0)
  })

  test("no matches returns empty", () => {
    const search = createListSearch<Msg>({ getText: (m) => m.text })
    search.sync(messages, getKey)
    search.search("zzzzz")
    expect(search.matches).toEqual([])
    expect(search.currentMatch).toBeUndefined()
    expect(search.currentMatchIndex).toBe(-1)
  })
})

describe("isListSearch", () => {
  test("returns true for ListSearch", () => {
    expect(isListSearch(createListSearch())).toBe(true)
  })

  test("returns false for config", () => {
    expect(isListSearch({ getText: () => "" })).toBe(false)
  })

  test("returns false for primitives", () => {
    expect(isListSearch(true)).toBe(false)
    expect(isListSearch(null)).toBe(false)
  })
})

describe("resolveListSearch", () => {
  test("true creates default search", () => {
    expect(isListSearch(resolveListSearch(true))).toBe(true)
  })

  test("config creates configured search", () => {
    const search = resolveListSearch<Msg>({ getText: (m) => m.text })
    expect(isListSearch(search)).toBe(true)
  })

  test("domain object passes through", () => {
    const original = createListSearch()
    expect(resolveListSearch(original)).toBe(original)
  })
})
