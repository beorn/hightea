/**
 * Tests for viewport compositor - merges frozen history + live viewport.
 */

import { describe, test, expect } from "vitest"
import { createHistoryBuffer, createHistoryItem } from "../../packages/term/src/history-buffer"
import { composeViewport } from "../../packages/term/src/viewport-compositor"

function pushRow(history: ReturnType<typeof createHistoryBuffer>, key: string, text: string) {
  history.push(createHistoryItem(key, text, 80))
}

describe("composeViewport", () => {
  test("at tail (scrollOffset=0) returns no history rows", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")

    const result = composeViewport({
      history,
      viewportHeight: 10,
      scrollOffset: 0,
    })

    expect(result.isScrolledUp).toBe(false)
    expect(result.historyRows).toEqual([])
    expect(result.historyRowCount).toBe(0)
    expect(result.totalHeight).toBe(12) // 2 history + 10 viewport
  })

  test("scrolled up shows history rows", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")
    pushRow(history, "c", "row-3")

    // scrollOffset=3 means scrolled back 3 from tail, viewportHeight=2
    const result = composeViewport({
      history,
      viewportHeight: 2,
      scrollOffset: 3,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.historyRowCount).toBe(2)
    // scrollOffset=3 from tail of 3 items, viewport=2: shows rows at offset 1..2
    expect(result.historyRows).toEqual(["row-2", "row-3"])
  })

  test("scrollOffset clamped to available history", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")

    const result = composeViewport({
      history,
      viewportHeight: 5,
      scrollOffset: 100,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.historyRowCount).toBe(1)
    expect(result.historyRows).toEqual(["row-1"])
  })

  test("empty history returns no rows", () => {
    const history = createHistoryBuffer()

    const result = composeViewport({
      history,
      viewportHeight: 10,
      scrollOffset: 5,
    })

    expect(result.isScrolledUp).toBe(false)
    expect(result.historyRows).toEqual([])
    expect(result.historyRowCount).toBe(0)
  })

  test("totalHeight is history rows + viewport", () => {
    const history = createHistoryBuffer()
    history.push(createHistoryItem("a", "r1\nr2\nr3", 80))

    const result = composeViewport({
      history,
      viewportHeight: 20,
      scrollOffset: 0,
    })

    expect(result.totalHeight).toBe(23) // 3 history + 20 viewport
  })

  test("partial viewport fill when scrolled up near top", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")

    // scrollOffset=1, viewport=5 → only 1 row of history visible
    const result = composeViewport({
      history,
      viewportHeight: 5,
      scrollOffset: 1,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.historyRowCount).toBe(1)
    // scrollOffset=1, 2 items: shows the last row (row-2 is at index 1)
    expect(result.historyRows).toEqual(["row-1"])
  })
})
