/**
 * Tests for calcEdgeBasedScrollOffset
 */
import { test, expect, describe } from "vitest"
import { calcEdgeBasedScrollOffset } from "../src/scroll-utils.js"

describe("calcEdgeBasedScrollOffset", () => {
  test("no scrolling when all items fit", () => {
    expect(calcEdgeBasedScrollOffset(0, 0, 5, 3, 1)).toBe(0)
  })

  test("scrolls forward when selected item past visible end", () => {
    // 5 items, viewport shows 3, padding 1
    expect(calcEdgeBasedScrollOffset(4, 0, 3, 5, 1)).toBe(2)
  })

  test("scrolls back when selected item before visible start", () => {
    expect(calcEdgeBasedScrollOffset(0, 2, 3, 5, 1)).toBe(0)
  })

  describe("single-item viewport (visibleCount=1)", () => {
    // Regression: infinite oscillation when viewport fits only 1 item.
    // With 2 items, scrollTo=1:
    //   offset=0 → selectedIndex > paddedEnd → offset becomes 1
    //   offset=1 → small viewport context case → offset becomes 0
    //   → infinite loop
    //
    // Fix: small viewport context case only fires when visibleCount > padding.

    test("does not oscillate with 2 items and scrollTo=1", () => {
      const offset1 = calcEdgeBasedScrollOffset(1, 0, 1, 2, 1)
      expect(offset1).toBe(1) // scroll forward to show item 1

      const offset2 = calcEdgeBasedScrollOffset(1, 1, 1, 2, 1)
      expect(offset2).toBe(1) // MUST stay at 1, not snap back to 0
    })

    test("does not oscillate with 3 items and scrollTo=1", () => {
      const offset1 = calcEdgeBasedScrollOffset(1, 0, 1, 3, 1)
      expect(offset1).toBe(1)

      const offset2 = calcEdgeBasedScrollOffset(1, 1, 1, 3, 1)
      expect(offset2).toBe(1) // stable
    })

    test("scrolls back when selecting item 0 from offset=1", () => {
      const offset = calcEdgeBasedScrollOffset(0, 1, 1, 2, 1)
      expect(offset).toBe(0) // must show item 0
    })

    test("scrolls forward when selecting last item", () => {
      const offset = calcEdgeBasedScrollOffset(2, 0, 1, 3, 1)
      expect(offset).toBe(2)
    })
  })

  describe("two-item viewport (visibleCount=2)", () => {
    test("small viewport context scrollback works when visibleCount > padding", () => {
      // 5 items, viewport shows 2, padding=1
      // Selected=1, current offset=1: selected is at paddedStart.
      // Should scroll back to show context (selected - padding = 0).
      const offset = calcEdgeBasedScrollOffset(1, 1, 2, 5, 1)
      expect(offset).toBe(0) // context scrollback: show item 0 and 1
    })
  })
})
