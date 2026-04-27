/**
 * Contract: `createTextFrame(buffer)` returns a snapshot that is **detached
 * from the source buffer once read**. Reads of `.text`, `.ansi`, `.lines`,
 * `.cell()`, and `.containsText()` materialize an internal clone on first
 * access (lazy). After that first access, subsequent mutations to the source
 * buffer must not affect the frame, and repeated reads of any property must
 * return the same value.
 *
 * Why lazy and not eager: hot paths (e.g. test renderers) create frames per
 * render that are never read, so an eager clone would charge every caller
 * for an 80K-cell copy that's discarded immediately. The trade-off is that
 * mutations between `createTextFrame()` and the first read leak through —
 * callers needing strict construction-time detachment should clone the
 * buffer themselves before calling.
 *
 * These tests assert detachment for every read path on `TextFrame`.
 */

import { describe, test, expect } from "vitest"
import { TerminalBuffer, createTextFrame } from "@silvery/ag-term/buffer"

function fillText(buf: TerminalBuffer, lines: string[]): void {
  for (let y = 0; y < lines.length && y < buf.height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < buf.width; x++) {
      buf.setCell(x, y, { char: line[x]!, fg: null, bg: null })
    }
  }
}

describe("createTextFrame — detachment after first read", () => {
  test(".text snapshot is stable across later buffer mutations", () => {
    const buf = new TerminalBuffer(10, 2)
    fillText(buf, ["Hello", "World"])

    const frame = createTextFrame(buf)
    const text1 = frame.text // materialize snapshot

    // Mutate the source buffer AFTER the first read.
    fillText(buf, ["MUTATED!!!", "MUTATED!!!"])

    // Frame must still see the original snapshot, not the mutation.
    expect(frame.text).toBe(text1)
    expect(frame.text).toContain("Hello")
    expect(frame.text).toContain("World")
    expect(frame.text).not.toContain("MUTATED")
  })

  test(".ansi snapshot is stable across later buffer mutations", () => {
    const buf = new TerminalBuffer(10, 1)
    fillText(buf, ["Hello"])

    const frame = createTextFrame(buf)
    const ansi1 = frame.ansi // materialize snapshot

    fillText(buf, ["MUTATED!!!"])

    expect(frame.ansi).toBe(ansi1)
    expect(frame.ansi).toContain("Hello")
    expect(frame.ansi).not.toContain("MUTATED")
  })

  test(".lines snapshot is stable across later buffer mutations", () => {
    const buf = new TerminalBuffer(8, 3)
    fillText(buf, ["aaaa", "bbbb", "cccc"])

    const frame = createTextFrame(buf)
    const lines1 = frame.lines.slice() // copy to compare structurally

    fillText(buf, ["xxxx", "yyyy", "zzzz"])

    expect(frame.lines).toEqual(lines1)
    expect(frame.lines).toHaveLength(3)
    expect(frame.lines[0]).toContain("aaaa")
    expect(frame.lines[1]).toContain("bbbb")
    expect(frame.lines[2]).toContain("cccc")
  })

  test(".cell() snapshot is stable across later buffer mutations", () => {
    const buf = new TerminalBuffer(5, 1)
    fillText(buf, ["Hello"])

    const frame = createTextFrame(buf)
    // Materialize the cell-data snapshot via a single cell access.
    expect(frame.cell(0, 0).char).toBe("H")

    // Mutate the source buffer; cells from the snapshot must stay stable.
    fillText(buf, ["XXXXX"])

    expect(frame.cell(0, 0).char).toBe("H")
    expect(frame.cell(1, 0).char).toBe("e")
    expect(frame.cell(2, 0).char).toBe("l")
    expect(frame.cell(3, 0).char).toBe("l")
    expect(frame.cell(4, 0).char).toBe("o")
  })

  test(".containsText() snapshot is stable across later buffer mutations", () => {
    const buf = new TerminalBuffer(20, 1)
    fillText(buf, ["greeting: hi"])

    const frame = createTextFrame(buf)
    expect(frame.containsText("greeting: hi")).toBe(true) // materialize

    fillText(buf, ["greeting: bye       "])

    expect(frame.containsText("greeting: hi")).toBe(true)
    expect(frame.containsText("bye")).toBe(false)
  })

  test("dimensions are frozen at creation (do not need a read to detach)", () => {
    const buf = new TerminalBuffer(10, 5)
    fillText(buf, ["row0", "row1", "row2", "row3", "row4"])

    const frame = createTextFrame(buf)

    // width/height are captured eagerly at construction, before any read.
    expect(frame.width).toBe(10)
    expect(frame.height).toBe(5)
  })

  test("repeated reads of the same property return the same value", () => {
    const buf = new TerminalBuffer(6, 1)
    fillText(buf, ["abcdef"])

    const frame = createTextFrame(buf)
    const text1 = frame.text

    // Mutate the buffer between reads.
    fillText(buf, ["zzzzzz"])
    const text2 = frame.text

    expect(text1).toBe(text2) // both reads see the same snapshot
  })

  test("interleaved access paths share the same snapshot", () => {
    const buf = new TerminalBuffer(5, 1)
    fillText(buf, ["Hello"])

    const frame = createTextFrame(buf)

    // Hit .cell() first to force snapshot + cellData materialization.
    expect(frame.cell(0, 0).char).toBe("H")

    // Mutate the source buffer.
    fillText(buf, ["WORLD"])

    // .text reads from the same snapshot — must still see Hello, not WORLD.
    expect(frame.text).toContain("Hello")
    expect(frame.text).not.toContain("WORLD")
    expect(frame.cell(0, 0).char).toBe("H")
    expect(frame.cell(4, 0).char).toBe("o")
  })
})
