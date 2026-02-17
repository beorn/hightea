/**
 * Text Operations Tests
 *
 * Tests for TextOp type and operations: applyTextOp, invertTextOp, mergeTextOps.
 * These are the foundation for operations-based undo/redo.
 */

import { describe, expect, test } from "vitest"
import { applyTextOp, invertTextOp, mergeTextOps, type TextOp } from "../src/text-ops.ts"

// =============================================================================
// applyTextOp
// =============================================================================

describe("applyTextOp", () => {
  test("insert at beginning", () => {
    expect(applyTextOp("world", { type: "insert", offset: 0, text: "hello " })).toBe("hello world")
  })

  test("insert at middle", () => {
    expect(applyTextOp("hllo", { type: "insert", offset: 1, text: "e" })).toBe("hello")
  })

  test("insert at end", () => {
    expect(applyTextOp("hello", { type: "insert", offset: 5, text: "!" })).toBe("hello!")
  })

  test("insert empty string (no-op)", () => {
    expect(applyTextOp("hello", { type: "insert", offset: 3, text: "" })).toBe("hello")
  })

  test("insert multi-character text", () => {
    expect(applyTextOp("hd", { type: "insert", offset: 1, text: "ello worl" })).toBe("hello world")
  })

  test("delete at beginning", () => {
    expect(applyTextOp("hello world", { type: "delete", offset: 0, text: "hello " })).toBe("world")
  })

  test("delete at middle", () => {
    expect(applyTextOp("hello", { type: "delete", offset: 2, text: "ll" })).toBe("heo")
  })

  test("delete at end", () => {
    expect(applyTextOp("hello!", { type: "delete", offset: 5, text: "!" })).toBe("hello")
  })

  test("delete empty range (no-op)", () => {
    expect(applyTextOp("hello", { type: "delete", offset: 3, text: "" })).toBe("hello")
  })

  test("delete multi-character text", () => {
    expect(applyTextOp("hello world", { type: "delete", offset: 5, text: " world" })).toBe("hello")
  })

  test("insert into empty string", () => {
    expect(applyTextOp("", { type: "insert", offset: 0, text: "hello" })).toBe("hello")
  })

  test("delete entire string", () => {
    expect(applyTextOp("hello", { type: "delete", offset: 0, text: "hello" })).toBe("")
  })

  test("throws on negative offset", () => {
    expect(() => applyTextOp("hello", { type: "insert", offset: -1, text: "x" })).toThrow(RangeError)
  })

  test("throws on insert offset beyond text length", () => {
    expect(() => applyTextOp("hello", { type: "insert", offset: 6, text: "x" })).toThrow(RangeError)
  })

  test("throws on delete extending past end", () => {
    expect(() => applyTextOp("hello", { type: "delete", offset: 3, text: "loXX" })).toThrow(RangeError)
  })

  test("throws on delete mismatch", () => {
    expect(() => applyTextOp("hello", { type: "delete", offset: 1, text: "xx" })).toThrow(/mismatch/)
  })
})

// =============================================================================
// invertTextOp
// =============================================================================

describe("invertTextOp", () => {
  test("insert inverts to delete (same offset, same text)", () => {
    const op: TextOp = { type: "insert", offset: 5, text: "hello" }
    const inv = invertTextOp(op)
    expect(inv).toEqual({ type: "delete", offset: 5, text: "hello" })
  })

  test("delete inverts to insert (same offset, same text)", () => {
    const op: TextOp = { type: "delete", offset: 3, text: "abc" }
    const inv = invertTextOp(op)
    expect(inv).toEqual({ type: "insert", offset: 3, text: "abc" })
  })

  test("double invert returns original", () => {
    const op: TextOp = { type: "insert", offset: 2, text: "xyz" }
    expect(invertTextOp(invertTextOp(op))).toEqual(op)
  })

  test("double invert returns original (delete)", () => {
    const op: TextOp = { type: "delete", offset: 0, text: "foo" }
    expect(invertTextOp(invertTextOp(op))).toEqual(op)
  })

  test("applying op then inverse returns original text", () => {
    const original = "hello world"
    const op: TextOp = { type: "insert", offset: 5, text: " beautiful" }
    const after = applyTextOp(original, op)
    expect(after).toBe("hello beautiful world")
    const inv = invertTextOp(op)
    const restored = applyTextOp(after, inv)
    expect(restored).toBe(original)
  })

  test("applying delete then inverse restores original", () => {
    const original = "hello beautiful world"
    const op: TextOp = { type: "delete", offset: 5, text: " beautiful" }
    const after = applyTextOp(original, op)
    expect(after).toBe("hello world")
    const inv = invertTextOp(op)
    const restored = applyTextOp(after, inv)
    expect(restored).toBe(original)
  })
})

// =============================================================================
// mergeTextOps
// =============================================================================

describe("mergeTextOps", () => {
  test("consecutive inserts at adjacent positions merge", () => {
    const a: TextOp = { type: "insert", offset: 0, text: "h" }
    const b: TextOp = { type: "insert", offset: 1, text: "e" }
    expect(mergeTextOps(a, b)).toEqual({ type: "insert", offset: 0, text: "he" })
  })

  test("multi-char adjacent inserts merge", () => {
    const a: TextOp = { type: "insert", offset: 5, text: "abc" }
    const b: TextOp = { type: "insert", offset: 8, text: "def" }
    expect(mergeTextOps(a, b)).toEqual({ type: "insert", offset: 5, text: "abcdef" })
  })

  test("inserts at same position do not merge", () => {
    // b at offset 0, a ends at offset 1 -> b.offset (0) !== a.offset + a.text.length (1)
    const a: TextOp = { type: "insert", offset: 0, text: "a" }
    const b: TextOp = { type: "insert", offset: 0, text: "b" }
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("consecutive backspace deletes (position decreasing) merge", () => {
    // Typing "abc" then backspacing: delete 'c' at offset 2, then delete 'b' at offset 1
    const a: TextOp = { type: "delete", offset: 2, text: "c" }
    const b: TextOp = { type: "delete", offset: 1, text: "b" }
    // b.offset + b.text.length = 1 + 1 = 2 = a.offset -> merge
    expect(mergeTextOps(a, b)).toEqual({ type: "delete", offset: 1, text: "bc" })
  })

  test("consecutive forward-deletes at same offset merge", () => {
    // Forward-delete: delete at offset 5, next char slides into offset 5
    const a: TextOp = { type: "delete", offset: 5, text: "a" }
    const b: TextOp = { type: "delete", offset: 5, text: "b" }
    expect(mergeTextOps(a, b)).toEqual({ type: "delete", offset: 5, text: "ab" })
  })

  test("insert then unrelated insert returns null (can't merge)", () => {
    const a: TextOp = { type: "insert", offset: 0, text: "x" }
    const b: TextOp = { type: "insert", offset: 10, text: "y" }
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("delete then insert at different position returns null", () => {
    const a: TextOp = { type: "delete", offset: 5, text: "x" }
    const b: TextOp = { type: "insert", offset: 0, text: "y" }
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("insert then delete that exactly cancels returns null", () => {
    // Insert "abc" at offset 5, then delete "abc" at offset 5 -> cancel
    const a: TextOp = { type: "insert", offset: 5, text: "abc" }
    const b: TextOp = { type: "delete", offset: 5, text: "abc" }
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("deletes at non-adjacent offsets return null", () => {
    const a: TextOp = { type: "delete", offset: 10, text: "a" }
    const b: TextOp = { type: "delete", offset: 5, text: "b" }
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("insert then delete that does not cancel returns null", () => {
    const a: TextOp = { type: "insert", offset: 5, text: "abc" }
    const b: TextOp = { type: "delete", offset: 5, text: "ab" } // partial, different text
    expect(mergeTextOps(a, b)).toBeNull()
  })

  test("delete then insert at same offset returns null (different types, not cancel)", () => {
    const a: TextOp = { type: "delete", offset: 5, text: "x" }
    const b: TextOp = { type: "insert", offset: 5, text: "y" }
    expect(mergeTextOps(a, b)).toBeNull()
  })
})
