/**
 * Viewport height boundary tests for the output phase.
 *
 * The zoom garble bug was never caught because all test fixtures used small
 * node trees that always fit in the test terminal. When buffer content exceeded
 * terminal height, bufferToAnsi wrote past the terminal's last row, causing
 * the alternate screen to scroll and desynchronizing prevBuffer.
 *
 * The fix caps fullscreen output at termRows. These tests verify correct
 * behavior at the boundary: rows-1, rows, rows+1, 2*rows.
 */
import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { TerminalBuffer } from "@silvery/term/buffer"
import { outputPhase } from "@silvery/term/pipeline/output-phase"

const COLS = 80

/**
 * Fill buffer rows with distinct content so each row is identifiable.
 * Row y gets "Row <y>" left-aligned.
 */
function fillBuffer(buf: TerminalBuffer, startRow: number, endRow: number): void {
  for (let y = startRow; y < endRow; y++) {
    const text = `Row ${y}`
    for (let x = 0; x < text.length && x < buf.width; x++) {
      buf.setCell(x, y, { char: text[x]! })
    }
  }
}

/**
 * Read a row from the xterm.js terminal as a string.
 */
function readTermRow(term: ReturnType<typeof createTerminal>, row: number): string {
  const line = term.getLine(row)
  return line
    .map((c) => c.char)
    .join("")
    .trimEnd()
}

/**
 * Compare two terminals cell-by-cell and return mismatch descriptions.
 */
function compareCells(
  termA: ReturnType<typeof createTerminal>,
  termB: ReturnType<typeof createTerminal>,
  rows: number,
  cols: number,
): string[] {
  const mismatches: string[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = termA.getCell(y, x)
      const b = termB.getCell(y, x)
      if (a?.char !== b?.char) {
        mismatches.push(`(${x},${y}): a='${a?.char}' b='${b?.char}'`)
      }
    }
  }
  return mismatches
}

describe("viewport height boundary", () => {
  describe("fullscreen fresh render", () => {
    test("buffer exactly at terminal height (rows == termRows)", () => {
      const TERM_ROWS = 10
      const buf = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf, 0, TERM_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })

    test("buffer one row short (rows-1): unused last row", () => {
      const TERM_ROWS = 10
      const buf = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf, 0, TERM_ROWS - 1)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS - 1; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      // Last row should be empty (unfilled)
      expect(readTermRow(term, TERM_ROWS - 1)).toBe("")
      term.close()
    })

    test("buffer one row over (rows+1): caps output at termRows, no scroll", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = TERM_ROWS + 1
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      // Only first TERM_ROWS rows should be visible (capped)
      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      // Row 0 should still be Row 0 (not scrolled away)
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("buffer double terminal height (2*rows): caps at termRows, first rows visible", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = TERM_ROWS * 2
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })
  })

  describe("fullscreen incremental render with overflow", () => {
    test("incremental render after content overflows terminal: matches fresh", () => {
      // The exact zoom garble scenario:
      // 1. First render with buffer larger than terminal
      // 2. Change some cells
      // 3. Incremental render (outputPhase with prev buffer)
      // 4. Compare with fresh render through xterm.js
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Modify some cells in the visible area
      const next = prev.clone()
      const changed = "CHANGED"
      for (let x = 0; x < changed.length; x++) {
        next.setCell(x, 3, { char: changed[x]! })
      }

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)
      const freshAnsi = outputPhase(null, next, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termIncr.feed(initialAnsi)
      termIncr.feed(incrAnsi)

      const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termFresh.feed(freshAnsi)

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 3)).toContain("CHANGED")

      termIncr.close()
      termFresh.close()
    })

    test("incremental render with changes in overflow region: no ghost pixels", () => {
      // Changes beyond termRows should be silently ignored (clamped)
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Modify cells BEYOND terminal height (row 12)
      const next = prev.clone()
      const changed = "OVERFLOW"
      for (let x = 0; x < changed.length; x++) {
        next.setCell(x, 12, { char: changed[x]! })
      }

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)
      const freshAnsi = outputPhase(null, next, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termIncr.feed(initialAnsi)
      termIncr.feed(incrAnsi)

      const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termFresh.feed(freshAnsi)

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 0)).toContain("Row 0")

      termIncr.close()
      termFresh.close()
    })

    test("multiple incremental renders with overflowing buffer stay consistent", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 20

      const buf1 = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf1, 0, BUF_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      const buf2 = buf1.clone()
      for (let x = 0; x < 5; x++) buf2.setCell(x, 2, { char: "AAAAA"[x]! })
      const render2 = outputPhase(buf1, buf2, "fullscreen", 0, TERM_ROWS)

      const buf3 = buf2.clone()
      for (let x = 0; x < 5; x++) buf3.setCell(x, 5, { char: "BBBBB"[x]! })
      const render3 = outputPhase(buf2, buf3, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termIncr.feed(render1)
      termIncr.feed(render2)
      termIncr.feed(render3)

      const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termFresh.feed(outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 2)).toContain("AAAAA")
      expect(readTermRow(termIncr, 5)).toContain("BBBBB")

      termIncr.close()
      termFresh.close()
    })
  })

  describe("zoom transition (buffer height changes)", () => {
    test("buffer grows beyond terminal then shrinks back: incremental is correct", () => {
      const TERM_ROWS = 10

      // Frame 1: buffer fits terminal
      const buf1 = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf1, 0, TERM_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      // Frame 2: buffer grows beyond terminal (zoom in scenario)
      // Different buffer dimensions → triggers fresh render path
      const buf2 = new TerminalBuffer(COLS, TERM_ROWS + 5)
      fillBuffer(buf2, 0, TERM_ROWS + 5)
      const render2 = outputPhase(null, buf2, "fullscreen", 0, TERM_ROWS)

      // Frame 3: buffer shrinks back to terminal height
      const buf3 = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf3, 0, TERM_ROWS)
      const render3 = outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(render1)
      term.feed(render2)
      term.feed(render3)

      const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termFresh.feed(outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(term, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }

      term.close()
      termFresh.close()
    })

    test("incremental render after overflow with same-size buffer: no desync", () => {
      // Same buffer dimensions, content changes, buffer larger than terminal throughout
      const TERM_ROWS = 10
      const BUF_ROWS = 15

      const buf1 = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf1, 0, BUF_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      const buf2 = buf1.clone()
      const text2 = "Frame2-Row1"
      for (let x = 0; x < text2.length; x++) buf2.setCell(x, 1, { char: text2[x]! })
      const render2 = outputPhase(buf1, buf2, "fullscreen", 0, TERM_ROWS)

      const buf3 = buf2.clone()
      const text3 = "Frame3-Row7"
      for (let x = 0; x < text3.length; x++) buf3.setCell(x, 7, { char: text3[x]! })
      const render3 = outputPhase(buf2, buf3, "fullscreen", 0, TERM_ROWS)

      const buf4 = buf3.clone()
      const text4 = "Frame4-Row9"
      for (let x = 0; x < text4.length; x++) buf4.setCell(x, 9, { char: text4[x]! })
      const render4 = outputPhase(buf3, buf4, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termIncr.feed(render1)
      termIncr.feed(render2)
      termIncr.feed(render3)
      termIncr.feed(render4)

      const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      termFresh.feed(outputPhase(null, buf4, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      expect(readTermRow(termIncr, 1)).toContain("Frame2-Row1")
      expect(readTermRow(termIncr, 7)).toContain("Frame3-Row7")
      expect(readTermRow(termIncr, 9)).toContain("Frame4-Row9")

      termIncr.close()
      termFresh.close()
    })
  })

  describe("resize smaller while content at full height", () => {
    test("terminal shrinks: output capped to new smaller height", () => {
      const ORIG_ROWS = 15
      const SHRUNK_ROWS = 8

      const buf = new TerminalBuffer(COLS, ORIG_ROWS)
      fillBuffer(buf, 0, ORIG_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, SHRUNK_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: SHRUNK_ROWS })
      term.feed(ansi)

      for (let y = 0; y < SHRUNK_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("resize smaller after incremental renders: no stale content", () => {
      const ORIG_ROWS = 12
      const SHRUNK_ROWS = 6

      // Initial render at original size
      const buf1 = new TerminalBuffer(COLS, ORIG_ROWS)
      fillBuffer(buf1, 0, ORIG_ROWS)

      // After resize, fresh render capped to smaller terminal
      const ansi = outputPhase(null, buf1, "fullscreen", 0, SHRUNK_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: SHRUNK_ROWS })
      term.feed(ansi)

      for (let y = 0; y < SHRUNK_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })
  })

  describe("edge cases", () => {
    test("termRows = 1: single visible row", () => {
      const TERM_ROWS = 1
      const BUF_ROWS = 5
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("no termRows cap (undefined): renders all rows", () => {
      const BUF_ROWS = 10
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen")
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: BUF_ROWS })
      term.feed(ansi)

      for (let y = 0; y < BUF_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })

    test("termRows equals buffer height: no capping needed", () => {
      const ROWS = 10
      const buf = new TerminalBuffer(COLS, ROWS)
      fillBuffer(buf, 0, ROWS)

      const ansiCapped = outputPhase(null, buf, "fullscreen", 0, ROWS)
      const ansiUncapped = outputPhase(null, buf, "fullscreen")

      const termCapped = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      termCapped.feed(ansiCapped)

      const termUncapped = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      termUncapped.feed(ansiUncapped)

      const mismatches = compareCells(termCapped, termUncapped, ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      termCapped.close()
      termUncapped.close()
    })

    test("incremental render clamping: changes at row termRows-1 are included", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Change the last visible row (row 9, the boundary)
      const next = prev.clone()
      const text = "BOUNDARY"
      for (let x = 0; x < text.length; x++) next.setCell(x, TERM_ROWS - 1, { char: text[x]! })

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(initialAnsi)
      term.feed(incrAnsi)

      expect(readTermRow(term, TERM_ROWS - 1)).toContain("BOUNDARY")
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("incremental render clamping: changes at row termRows are excluded", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Change exactly at row termRows (the first invisible row)
      const next = prev.clone()
      const text = "INVISIBLE"
      for (let x = 0; x < text.length; x++) next.setCell(x, TERM_ROWS, { char: text[x]! })

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(initialAnsi)
      term.feed(incrAnsi)

      // Visible rows should be unchanged from initial render
      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })
  })
})
