/**
 * Edit Context Tests
 *
 * Tests for createTermEditContext factory — the W3C EditContext-aligned
 * terminal text editing primitive. Layer 1 of the editing architecture.
 *
 * Covers: construction, text updates, cursor movement, convenience methods,
 * boundary detection, events, state queries, wrapWidth, dispose.
 */

import { describe, expect, test, vi } from "vitest"
import { createTermEditContext } from "../src/edit-context.ts"

// =============================================================================
// Construction
// =============================================================================

describe("construction", () => {
  test("default options: empty text, cursor at 0", () => {
    using ctx = createTermEditContext()
    expect(ctx.text).toBe("")
    expect(ctx.selectionStart).toBe(0)
    expect(ctx.selectionEnd).toBe(0)
    expect(ctx.wrapWidth).toBe(80)
    expect(ctx.stickyX).toBeNull()
  })

  test("with initial text and cursor position", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 5,
    })
    expect(ctx.text).toBe("hello world")
    expect(ctx.selectionStart).toBe(5)
    expect(ctx.selectionEnd).toBe(5)
  })

  test("with custom wrapWidth", () => {
    using ctx = createTermEditContext({ wrapWidth: 40 })
    expect(ctx.wrapWidth).toBe(40)
  })

  test("selectionEnd defaults to selectionStart", () => {
    using ctx = createTermEditContext({ text: "abc", selectionStart: 2 })
    expect(ctx.selectionEnd).toBe(2)
  })

  test("explicit selectionEnd", () => {
    using ctx = createTermEditContext({
      text: "abc",
      selectionStart: 1,
      selectionEnd: 3,
    })
    expect(ctx.selectionStart).toBe(1)
    expect(ctx.selectionEnd).toBe(3)
  })
})

// =============================================================================
// Text updates (updateText)
// =============================================================================

describe("updateText", () => {
  test("insert character at cursor position", () => {
    using ctx = createTermEditContext({ text: "hllo", selectionStart: 1 })
    const op = ctx.updateText(1, 1, "e")
    expect(ctx.text).toBe("hello")
    expect(ctx.selectionStart).toBe(2) // cursor moves past inserted text
    expect(op.type).toBe("insert")
    expect(op.offset).toBe(1)
    expect(op.text).toBe("e")
  })

  test("delete character before cursor (backspace)", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const op = ctx.updateText(2, 3, "")
    expect(ctx.text).toBe("helo")
    expect(ctx.selectionStart).toBe(2)
    expect(op.type).toBe("delete")
    expect(op.text).toBe("l")
  })

  test("replace selected range", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 5 })
    const op = ctx.updateText(0, 5, "goodbye")
    expect(ctx.text).toBe("goodbye world")
    expect(ctx.selectionStart).toBe(7) // cursor at end of inserted text
    expect(op.type).toBe("delete") // replacement emits delete op
    expect(op.text).toBe("hello")
  })

  test("insert at beginning of text", () => {
    using ctx = createTermEditContext({ text: "world" })
    ctx.updateText(0, 0, "hello ")
    expect(ctx.text).toBe("hello world")
    expect(ctx.selectionStart).toBe(6)
  })

  test("insert at end of text", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    ctx.updateText(5, 5, " world")
    expect(ctx.text).toBe("hello world")
    expect(ctx.selectionStart).toBe(11)
  })

  test("multi-character insert", () => {
    using ctx = createTermEditContext({ text: "" })
    ctx.updateText(0, 0, "hello world")
    expect(ctx.text).toBe("hello world")
    expect(ctx.selectionStart).toBe(11)
  })

  test("returns insert op for pure insert", () => {
    using ctx = createTermEditContext({ text: "ab" })
    const op = ctx.updateText(1, 1, "X")
    expect(op).toEqual({ type: "insert", offset: 1, text: "X" })
  })

  test("returns delete op for pure delete", () => {
    using ctx = createTermEditContext({ text: "abc" })
    const op = ctx.updateText(1, 2, "")
    expect(op).toEqual({ type: "delete", offset: 1, text: "b" })
  })

  test("throws on rangeStart > rangeEnd", () => {
    using ctx = createTermEditContext({ text: "hello" })
    expect(() => ctx.updateText(3, 1, "x")).toThrow(RangeError)
  })

  test("clamps out-of-range offsets", () => {
    using ctx = createTermEditContext({ text: "abc" })
    // rangeEnd beyond text length clamps to text.length
    ctx.updateText(0, 100, "xyz")
    expect(ctx.text).toBe("xyz")
  })
})

// =============================================================================
// Cursor movement (moveCursor)
// =============================================================================

describe("moveCursor", () => {
  test("left decrements selectionStart", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const moved = ctx.moveCursor("left")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(2)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("right increments selectionStart", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const moved = ctx.moveCursor("right")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(4)
  })

  test("left at position 0 returns false", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0 })
    expect(ctx.moveCursor("left")).toBe(false)
    expect(ctx.selectionStart).toBe(0)
  })

  test("right at end returns false", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    expect(ctx.moveCursor("right")).toBe(false)
    expect(ctx.selectionStart).toBe(5)
  })

  test("up with single line returns false (boundary)", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3, wrapWidth: 80 })
    expect(ctx.moveCursor("up")).toBe(false)
  })

  test("down with single line returns false (boundary)", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3, wrapWidth: 80 })
    expect(ctx.moveCursor("down")).toBe(false)
  })

  test("up moves to previous visual line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at "world" (offset 7), move up -> row 0, col 1 -> offset 1
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    expect(ctx.moveCursor("up")).toBe(true)
    expect(ctx.selectionStart).toBe(1)
  })

  test("down moves to next visual line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at offset 1 (row 0, col 1), move down -> row 1, col 1 -> offset 7
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 1,
      wrapWidth: 8,
    })
    expect(ctx.moveCursor("down")).toBe(true)
    expect(ctx.selectionStart).toBe(7)
  })

  test("stickyX preserved across vertical movement through short lines", () => {
    // "abcdefgh\nab\nabcdefgh" at width 20
    // Lines: ["abcdefgh", "ab", "abcdefgh"]
    // Start at row 0 col 5, move down -> short line clamps to 2, then down -> col 5 restored
    using ctx = createTermEditContext({
      text: "abcdefgh\nab\nabcdefgh",
      selectionStart: 5,
      wrapWidth: 20,
    })

    expect(ctx.moveCursor("down")).toBe(true)
    expect(ctx.selectionStart).toBe(11) // row 1, clamped to col 2 -> offset 9+2
    expect(ctx.stickyX).toBe(5) // remembers original column

    expect(ctx.moveCursor("down")).toBe(true)
    expect(ctx.selectionStart).toBe(17) // row 2, col 5 restored -> offset 12+5
  })

  test("left resets stickyX", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.moveCursor("up") // sets stickyX
    expect(ctx.stickyX).not.toBeNull()
    ctx.moveCursor("left") // should clear stickyX
    expect(ctx.stickyX).toBeNull()
  })

  test("right resets stickyX", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.moveCursor("up") // sets stickyX
    expect(ctx.stickyX).not.toBeNull()
    ctx.moveCursor("right") // should clear stickyX
    expect(ctx.stickyX).toBeNull()
  })
})

// =============================================================================
// Convenience methods
// =============================================================================

describe("convenience methods", () => {
  test("insertChar inserts and moves cursor forward", () => {
    using ctx = createTermEditContext({ text: "hllo", selectionStart: 1 })
    const op = ctx.insertChar("e")
    expect(ctx.text).toBe("hello")
    expect(ctx.selectionStart).toBe(2)
    expect(op.type).toBe("insert")
    expect(op.text).toBe("e")
  })

  test("insertChar with multi-char string", () => {
    using ctx = createTermEditContext({ text: "", selectionStart: 0 })
    ctx.insertChar("hello")
    expect(ctx.text).toBe("hello")
    expect(ctx.selectionStart).toBe(5)
  })

  test("deleteBackward at position 0 returns null", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0 })
    expect(ctx.deleteBackward()).toBeNull()
    expect(ctx.text).toBe("hello")
  })

  test("deleteBackward removes char before cursor", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    const op = ctx.deleteBackward()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("hell")
    expect(ctx.selectionStart).toBe(4)
    expect(op!.type).toBe("delete")
    expect(op!.text).toBe("o")
  })

  test("deleteForward at end returns null", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    expect(ctx.deleteForward()).toBeNull()
    expect(ctx.text).toBe("hello")
  })

  test("deleteForward removes char after cursor", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0 })
    const op = ctx.deleteForward()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("ello")
    expect(ctx.selectionStart).toBe(0)
    expect(op!.type).toBe("delete")
    expect(op!.text).toBe("h")
  })

  test("deleteWord removes word backward", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 11 })
    const op = ctx.deleteWord()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("hello ")
    expect(ctx.selectionStart).toBe(6)
  })

  test("deleteWord with spaces skips spaces then word", () => {
    using ctx = createTermEditContext({ text: "hello   world", selectionStart: 8 })
    // cursor at offset 8 (start of "world"), deleteWord should skip spaces then "hello"
    const op = ctx.deleteWord()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("world")
    expect(ctx.selectionStart).toBe(0)
  })

  test("deleteWord at position 0 returns null", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0 })
    expect(ctx.deleteWord()).toBeNull()
  })

  test("deleteToStart removes from line start to cursor", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 5,
      wrapWidth: 80,
    })
    const op = ctx.deleteToStart()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe(" world")
    expect(ctx.selectionStart).toBe(0)
  })

  test("deleteToStart at line start returns null", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 0,
      wrapWidth: 80,
    })
    expect(ctx.deleteToStart()).toBeNull()
  })

  test("deleteToEnd removes from cursor to line end", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 5,
      wrapWidth: 80,
    })
    const op = ctx.deleteToEnd()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("hello")
    expect(ctx.selectionStart).toBe(5)
  })

  test("deleteToEnd at line end returns null", () => {
    using ctx = createTermEditContext({
      text: "hello",
      selectionStart: 5,
      wrapWidth: 80,
    })
    expect(ctx.deleteToEnd()).toBeNull()
  })

  test("deleteBackward with selection deletes selected range", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 0,
      selectionEnd: 5,
    })
    const op = ctx.deleteBackward()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe(" world")
    expect(ctx.selectionStart).toBe(0)
  })

  test("deleteForward with selection deletes selected range", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 0,
      selectionEnd: 5,
    })
    const op = ctx.deleteForward()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe(" world")
    expect(ctx.selectionStart).toBe(0)
  })
})

// =============================================================================
// Boundary detection (atBoundary)
// =============================================================================

describe("atBoundary", () => {
  test("up is true on first visual line", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 3,
      wrapWidth: 80,
    })
    expect(ctx.atBoundary("up")).toBe(true)
  })

  test("up is false on second visual line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    expect(ctx.atBoundary("up")).toBe(false)
  })

  test("down is true on last visual line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor on "world" (last line)
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    expect(ctx.atBoundary("down")).toBe(true)
  })

  test("down is false on penultimate visual line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 3,
      wrapWidth: 8,
    })
    expect(ctx.atBoundary("down")).toBe(false)
  })

  test("with wrapped text (single logical line, multiple visual lines)", () => {
    // "hello beautiful world" at width 10 -> ["hello ", "beautiful ", "world"]
    using ctx = createTermEditContext({
      text: "hello beautiful world",
      wrapWidth: 10,
    })

    ctx.setCursorOffset(3) // row 0
    expect(ctx.atBoundary("up")).toBe(true)
    expect(ctx.atBoundary("down")).toBe(false)

    ctx.setCursorOffset(8) // row 1
    expect(ctx.atBoundary("up")).toBe(false)
    expect(ctx.atBoundary("down")).toBe(false)

    ctx.setCursorOffset(18) // row 2 (last)
    expect(ctx.atBoundary("up")).toBe(false)
    expect(ctx.atBoundary("down")).toBe(true)
  })

  test("with newlines (multiple logical lines)", () => {
    using ctx = createTermEditContext({
      text: "line1\nline2\nline3",
      wrapWidth: 80,
    })

    ctx.setCursorOffset(2) // in "line1"
    expect(ctx.atBoundary("up")).toBe(true)
    expect(ctx.atBoundary("down")).toBe(false)

    ctx.setCursorOffset(8) // in "line2"
    expect(ctx.atBoundary("up")).toBe(false)
    expect(ctx.atBoundary("down")).toBe(false)

    ctx.setCursorOffset(14) // in "line3"
    expect(ctx.atBoundary("up")).toBe(false)
    expect(ctx.atBoundary("down")).toBe(true)
  })

  test("single empty string: both up and down are true", () => {
    using ctx = createTermEditContext({ text: "", wrapWidth: 80 })
    expect(ctx.atBoundary("up")).toBe(true)
    expect(ctx.atBoundary("down")).toBe(true)
  })
})

// =============================================================================
// Events
// =============================================================================

describe("events", () => {
  test("onTextUpdate fires on updateText", () => {
    using ctx = createTermEditContext({ text: "hello" })
    const handler = vi.fn()
    ctx.onTextUpdate(handler)
    ctx.updateText(5, 5, "!")
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ type: "insert", offset: 5, text: "!" })
  })

  test("onTextUpdate fires on insertChar", () => {
    using ctx = createTermEditContext({ text: "" })
    const handler = vi.fn()
    ctx.onTextUpdate(handler)
    ctx.insertChar("a")
    expect(handler).toHaveBeenCalledOnce()
  })

  test("onTextUpdate fires on deleteBackward", () => {
    using ctx = createTermEditContext({ text: "abc", selectionStart: 3 })
    const handler = vi.fn()
    ctx.onTextUpdate(handler)
    ctx.deleteBackward()
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![0].type).toBe("delete")
  })

  test("onTextUpdate fires on deleteForward", () => {
    using ctx = createTermEditContext({ text: "abc", selectionStart: 0 })
    const handler = vi.fn()
    ctx.onTextUpdate(handler)
    ctx.deleteForward()
    expect(handler).toHaveBeenCalledOnce()
  })

  test("onTextUpdate fires on deleteWord", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 11 })
    const handler = vi.fn()
    ctx.onTextUpdate(handler)
    ctx.deleteWord()
    expect(handler).toHaveBeenCalledOnce()
  })

  test("onSelectionChange fires on cursor movement", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const handler = vi.fn()
    ctx.onSelectionChange(handler)
    ctx.moveCursor("left")
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(2, 2)
  })

  test("onSelectionChange fires on updateSelection", () => {
    using ctx = createTermEditContext({ text: "hello" })
    const handler = vi.fn()
    ctx.onSelectionChange(handler)
    ctx.updateSelection(3, 5)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(3, 5)
  })

  test("unsubscribe works (handler not called after unsubscribe)", () => {
    using ctx = createTermEditContext({ text: "hello" })
    const handler = vi.fn()
    const unsub = ctx.onTextUpdate(handler)
    ctx.insertChar("a")
    expect(handler).toHaveBeenCalledOnce()

    unsub()
    ctx.insertChar("b")
    expect(handler).toHaveBeenCalledOnce() // still 1, not 2
  })

  test("selection change unsubscribe works", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const handler = vi.fn()
    const unsub = ctx.onSelectionChange(handler)
    ctx.moveCursor("left")
    expect(handler).toHaveBeenCalledOnce()

    unsub()
    ctx.moveCursor("left")
    expect(handler).toHaveBeenCalledOnce()
  })

  test("multiple subscribers all fire", () => {
    using ctx = createTermEditContext({ text: "" })
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    ctx.onTextUpdate(handler1)
    ctx.onTextUpdate(handler2)
    ctx.insertChar("x")
    expect(handler1).toHaveBeenCalledOnce()
    expect(handler2).toHaveBeenCalledOnce()
  })

  test("onSelectionChange fires on text mutations (cursor moves)", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    const handler = vi.fn()
    ctx.onSelectionChange(handler)
    ctx.insertChar("X") // cursor moves from 3 to 4
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(4, 4)
  })
})

// =============================================================================
// State queries
// =============================================================================

describe("state queries", () => {
  test("getContent returns current text", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    expect(ctx.getContent()).toBe("hello")
    ctx.insertChar("!")
    expect(ctx.getContent()).toBe("hello!")
  })

  test("getCursorOffset returns selectionStart", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })
    expect(ctx.getCursorOffset()).toBe(3)
  })

  test("setCursorOffset updates selection", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0 })
    ctx.setCursorOffset(4)
    expect(ctx.selectionStart).toBe(4)
    expect(ctx.selectionEnd).toBe(4)
  })

  test("setCursorOffset clamps to text length", () => {
    using ctx = createTermEditContext({ text: "abc" })
    ctx.setCursorOffset(100)
    expect(ctx.selectionStart).toBe(3)
  })

  test("setCursorOffset clamps to 0 for negative", () => {
    using ctx = createTermEditContext({ text: "abc" })
    ctx.setCursorOffset(-5)
    expect(ctx.selectionStart).toBe(0)
  })

  test("getVisualLineCount with single line", () => {
    using ctx = createTermEditContext({ text: "hello", wrapWidth: 80 })
    expect(ctx.getVisualLineCount()).toBe(1)
  })

  test("getVisualLineCount with wrapping", () => {
    using ctx = createTermEditContext({ text: "hello world", wrapWidth: 8 })
    // ["hello ", "world"] -> 2
    expect(ctx.getVisualLineCount()).toBe(2)
  })

  test("getVisualLineCount with newlines", () => {
    using ctx = createTermEditContext({ text: "a\nb\nc", wrapWidth: 80 })
    expect(ctx.getVisualLineCount()).toBe(3)
  })

  test("getCursorRowCol returns correct visual position", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    // ["hello ", "world"] -> offset 7 is row 1, col 1
    expect(ctx.getCursorRowCol()).toEqual({ row: 1, col: 1 })
  })

  test("getCursorRowCol at start", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 0, wrapWidth: 80 })
    expect(ctx.getCursorRowCol()).toEqual({ row: 0, col: 0 })
  })

  test("getCursorRowCol at end", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 5, wrapWidth: 80 })
    expect(ctx.getCursorRowCol()).toEqual({ row: 0, col: 5 })
  })
})

// =============================================================================
// WrapWidth updates
// =============================================================================

describe("setWrapWidth", () => {
  test("changes wrapping behavior", () => {
    using ctx = createTermEditContext({ text: "hello world", wrapWidth: 80 })
    expect(ctx.getVisualLineCount()).toBe(1)
    ctx.setWrapWidth(8)
    expect(ctx.wrapWidth).toBe(8)
    expect(ctx.getVisualLineCount()).toBe(2)
  })

  test("throws on non-positive width", () => {
    using ctx = createTermEditContext()
    expect(() => ctx.setWrapWidth(0)).toThrow(RangeError)
    expect(() => ctx.setWrapWidth(-1)).toThrow(RangeError)
  })

  test("cursor position preserved after wrapWidth change", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 80,
    })
    ctx.setWrapWidth(8)
    // Cursor offset unchanged, but visual position changes
    expect(ctx.selectionStart).toBe(7)
    expect(ctx.getCursorRowCol()).toEqual({ row: 1, col: 1 })
  })
})

// =============================================================================
// Dispose
// =============================================================================

describe("dispose", () => {
  test("after dispose, subscriber arrays cleared", () => {
    const ctx = createTermEditContext({ text: "hello" })
    const textHandler = vi.fn()
    const selHandler = vi.fn()
    ctx.onTextUpdate(textHandler)
    ctx.onSelectionChange(selHandler)

    ctx[Symbol.dispose]()

    // Handlers should not fire after dispose
    ctx.insertChar("x")
    ctx.moveCursor("left")
    expect(textHandler).not.toHaveBeenCalled()
    expect(selHandler).not.toHaveBeenCalled()
  })

  test("methods still work after dispose", () => {
    const ctx = createTermEditContext({ text: "hello", selectionStart: 5 })
    ctx[Symbol.dispose]()

    // Should not throw -- methods work, just no subscribers
    ctx.insertChar("!")
    expect(ctx.text).toBe("hello!")
    ctx.moveCursor("left")
    expect(ctx.selectionStart).toBe(5)
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  test("empty string: insertChar", () => {
    using ctx = createTermEditContext({ text: "" })
    ctx.insertChar("a")
    expect(ctx.text).toBe("a")
    expect(ctx.selectionStart).toBe(1)
  })

  test("single character: full lifecycle", () => {
    using ctx = createTermEditContext({ text: "" })
    ctx.insertChar("x")
    expect(ctx.text).toBe("x")
    ctx.moveCursor("left")
    expect(ctx.selectionStart).toBe(0)
    ctx.deleteForward()
    expect(ctx.text).toBe("")
  })

  test("boundary: deleteBackward on single char", () => {
    using ctx = createTermEditContext({ text: "x", selectionStart: 1 })
    ctx.deleteBackward()
    expect(ctx.text).toBe("")
    expect(ctx.selectionStart).toBe(0)
  })

  test("boundary: deleteForward on single char", () => {
    using ctx = createTermEditContext({ text: "x", selectionStart: 0 })
    ctx.deleteForward()
    expect(ctx.text).toBe("")
    expect(ctx.selectionStart).toBe(0)
  })

  test("insertChar resets stickyX", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.moveCursor("up") // sets stickyX
    expect(ctx.stickyX).not.toBeNull()
    ctx.insertChar("x")
    expect(ctx.stickyX).toBeNull()
  })

  test("deleteBackward resets stickyX", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.moveCursor("up") // sets stickyX
    expect(ctx.stickyX).not.toBeNull()
    ctx.deleteBackward()
    expect(ctx.stickyX).toBeNull()
  })

  test("setCursorOffset resets stickyX", () => {
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.moveCursor("up") // sets stickyX
    expect(ctx.stickyX).not.toBeNull()
    ctx.setCursorOffset(3)
    expect(ctx.stickyX).toBeNull()
  })

  test("deleteToStart on wrapped text deletes to visual line start", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at offset 9 (row 1, col 3 "wor|ld")
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 9,
      wrapWidth: 8,
    })
    ctx.deleteToStart()
    // Should delete from offset 6 (start of "world") to offset 9
    expect(ctx.text).toBe("hello ld")
    expect(ctx.selectionStart).toBe(6)
  })

  test("deleteToEnd on wrapped text deletes to visual line end", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at offset 7 (row 1, col 1 "w|orld")
    using ctx = createTermEditContext({
      text: "hello world",
      selectionStart: 7,
      wrapWidth: 8,
    })
    ctx.deleteToEnd()
    // Should delete from offset 7 to offset 11 (end of "world")
    expect(ctx.text).toBe("hello w")
    expect(ctx.selectionStart).toBe(7)
  })
})
