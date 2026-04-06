/**
 * Tests for find state machine and buffer search.
 */
import { describe, test, expect } from "vitest"
import { createFindState, findUpdate, searchBuffer } from "@silvery/ag-term/find"
import { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Helpers
// ============================================================================

function createBufferWithText(lines: string[], width = 40): TerminalBuffer {
  const height = lines.length
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x]!, fg: null, bg: null })
    }
  }
  return buf
}

// ============================================================================
// searchBuffer
// ============================================================================

describe("searchBuffer", () => {
  test("finds a single match", () => {
    const buf = createBufferWithText(["hello world"])
    const matches = searchBuffer(buf, "world")
    expect(matches).toEqual([{ row: 0, startCol: 6, endCol: 10 }])
  })

  test("finds multiple matches on same row", () => {
    const buf = createBufferWithText(["foo bar foo baz foo"])
    const matches = searchBuffer(buf, "foo")
    expect(matches).toEqual([
      { row: 0, startCol: 0, endCol: 2 },
      { row: 0, startCol: 8, endCol: 10 },
      { row: 0, startCol: 16, endCol: 18 },
    ])
  })

  test("finds matches across multiple rows", () => {
    const buf = createBufferWithText(["hello world", "hello again", "goodbye"])
    const matches = searchBuffer(buf, "hello")
    expect(matches).toEqual([
      { row: 0, startCol: 0, endCol: 4 },
      { row: 1, startCol: 0, endCol: 4 },
    ])
  })

  test("case insensitive search", () => {
    const buf = createBufferWithText(["Hello HELLO hElLo"])
    const matches = searchBuffer(buf, "hello")
    expect(matches).toHaveLength(3)
  })

  test("empty query returns no matches", () => {
    const buf = createBufferWithText(["hello world"])
    expect(searchBuffer(buf, "")).toEqual([])
  })

  test("no matches returns empty array", () => {
    const buf = createBufferWithText(["hello world"])
    expect(searchBuffer(buf, "xyz")).toEqual([])
  })

  test("single character search", () => {
    const buf = createBufferWithText(["abcabc"])
    const matches = searchBuffer(buf, "a")
    expect(matches).toEqual([
      { row: 0, startCol: 0, endCol: 0 },
      { row: 0, startCol: 3, endCol: 3 },
    ])
  })

  test("overlapping matches", () => {
    const buf = createBufferWithText(["aaa"])
    const matches = searchBuffer(buf, "aa")
    expect(matches).toEqual([
      { row: 0, startCol: 0, endCol: 1 },
      { row: 0, startCol: 1, endCol: 2 },
    ])
  })

  test("match at end of row", () => {
    const buf = createBufferWithText(["hello"], 5)
    const matches = searchBuffer(buf, "lo")
    expect(matches).toEqual([{ row: 0, startCol: 3, endCol: 4 }])
  })
})

// ============================================================================
// findUpdate — search
// ============================================================================

describe("findUpdate — search", () => {
  test("search activates find and returns matches", () => {
    const buf = createBufferWithText(["hello world hello"])
    const state = createFindState()
    const [next, effects] = findUpdate({ type: "search", query: "hello", buffer: buf }, state)

    expect(next.active).toBe(true)
    expect(next.query).toBe("hello")
    expect(next.matches).toHaveLength(2)
    expect(next.currentIndex).toBe(0)
    expect(effects).toContainEqual({ type: "render" })
    expect(effects).toContainEqual({ type: "scrollTo", row: 0 })
  })

  test("search with no results", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createFindState()
    const [next, effects] = findUpdate({ type: "search", query: "xyz", buffer: buf }, state)

    expect(next.active).toBe(true)
    expect(next.query).toBe("xyz")
    expect(next.matches).toHaveLength(0)
    expect(next.currentIndex).toBe(-1)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("search replaces previous results", () => {
    const buf = createBufferWithText(["hello world foo"])
    const state = createFindState()
    const [first] = findUpdate({ type: "search", query: "hello", buffer: buf }, state)
    const [second] = findUpdate({ type: "search", query: "foo", buffer: buf }, first)

    expect(second.query).toBe("foo")
    expect(second.matches).toHaveLength(1)
    expect(second.currentIndex).toBe(0)
  })
})

// ============================================================================
// findUpdate — next/prev
// ============================================================================

describe("findUpdate — next/prev navigation", () => {
  test("next cycles through matches", () => {
    const buf = createBufferWithText(["a b a c a"])
    let [state] = findUpdate({ type: "search", query: "a", buffer: buf }, createFindState())

    expect(state.currentIndex).toBe(0)

    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(1)

    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(2)

    // Wraps around
    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(0)
  })

  test("prev cycles backwards through matches", () => {
    const buf = createBufferWithText(["a b a c a"])
    let [state] = findUpdate({ type: "search", query: "a", buffer: buf }, createFindState())

    // Wraps to last match
    ;[state] = findUpdate({ type: "prev" }, state)
    expect(state.currentIndex).toBe(2)

    ;[state] = findUpdate({ type: "prev" }, state)
    expect(state.currentIndex).toBe(1)
  })

  test("next is no-op with no matches", () => {
    const buf = createBufferWithText(["hello"])
    const [state] = findUpdate({ type: "search", query: "xyz", buffer: buf }, createFindState())
    const [next] = findUpdate({ type: "next" }, state)
    expect(next).toBe(state)
  })

  test("prev is no-op with no matches", () => {
    const buf = createBufferWithText(["hello"])
    const [state] = findUpdate({ type: "search", query: "xyz", buffer: buf }, createFindState())
    const [prev] = findUpdate({ type: "prev" }, state)
    expect(prev).toBe(state)
  })

  test("next emits scrollTo effect", () => {
    const buf = createBufferWithText(["hello", "world", "hello"])
    const [state] = findUpdate({ type: "search", query: "hello", buffer: buf }, createFindState())
    const [, effects] = findUpdate({ type: "next" }, state)
    expect(effects).toContainEqual({ type: "scrollTo", row: 2 })
  })
})

// ============================================================================
// findUpdate — close
// ============================================================================

describe("findUpdate — close", () => {
  test("close resets state", () => {
    const buf = createBufferWithText(["hello world"])
    const [state] = findUpdate({ type: "search", query: "hello", buffer: buf }, createFindState())
    const [next, effects] = findUpdate({ type: "close" }, state)

    expect(next.active).toBe(false)
    expect(next.query).toBeNull()
    expect(next.matches).toHaveLength(0)
    expect(next.currentIndex).toBe(-1)
    expect(effects).toEqual([{ type: "render" }])
  })
})

// ============================================================================
// findUpdate — selectCurrent
// ============================================================================

describe("findUpdate — selectCurrent", () => {
  test("selectCurrent emits setSelection for current match", () => {
    const buf = createBufferWithText(["hello world hello"])
    const [state] = findUpdate({ type: "search", query: "hello", buffer: buf }, createFindState())
    const [, effects] = findUpdate({ type: "selectCurrent" }, state)

    expect(effects).toContainEqual({
      type: "setSelection",
      match: { row: 0, startCol: 0, endCol: 4 },
    })
  })

  test("selectCurrent after next selects the right match", () => {
    const buf = createBufferWithText(["hello world hello"])
    let [state] = findUpdate({ type: "search", query: "hello", buffer: buf }, createFindState())
    ;[state] = findUpdate({ type: "next" }, state)
    const [, effects] = findUpdate({ type: "selectCurrent" }, state)

    expect(effects).toContainEqual({
      type: "setSelection",
      match: { row: 0, startCol: 12, endCol: 16 },
    })
  })

  test("selectCurrent is no-op when not active", () => {
    const state = createFindState()
    const [next, effects] = findUpdate({ type: "selectCurrent" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("selectCurrent is no-op with no matches", () => {
    const buf = createBufferWithText(["hello"])
    const [state] = findUpdate({ type: "search", query: "xyz", buffer: buf }, createFindState())
    const [next, effects] = findUpdate({ type: "selectCurrent" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })
})
