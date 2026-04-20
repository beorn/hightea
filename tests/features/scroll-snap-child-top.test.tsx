/**
 * Regression: scrollOffset snap-to-child-top for mixed-height children.
 *
 * When a scroll container with `overflowIndicator` has children of
 * heterogeneous heights and the user scrolls forward (target below viewport)
 * or backward (target above viewport), the naive pixel-exact scrollOffset
 * (`target.bottom - effectiveHeight` or `target.top`) can land inside an
 * earlier/adjacent child, clipping that child's top border. The overflow
 * indicator then overwrites the clipped row, producing a "headless card" at
 * the top of the viewport. Users perceive this as "the column got shorter"
 * (see km-tui bug `column-top-disappears`).
 *
 * Fix: layout-phase.ts `calculateScrollState` now reserves one row for the
 * TOP indicator by snapping scrollOffset so the first visible child starts
 * at viewport row 1 (below the indicator), not row 0 (where the indicator
 * would overwrite it).
 *
 * These tests verify both directions (scroll forward, scroll backward) at
 * realistic scale (50+ items with mixed heights).
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "silvery"

let origStrict: string | undefined

beforeEach(() => {
  origStrict = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "2"
})

afterEach(() => {
  if (origStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = origStrict
  }
})

/**
 * Build 50 mixed-height items: every 3rd item is 4 rows tall, the rest are
 * 1 row. This matches the "tall card + short card" pattern from the
 * km-tui `column-top-disappears` repro.
 */
function Item({ index }: { index: number }): React.ReactElement {
  const isTall = index % 3 === 0
  if (isTall) {
    return (
      <Box flexDirection="column" borderStyle="round">
        <Text>tall-{index}</Text>
        <Text>body-a</Text>
        <Text>body-b</Text>
      </Box>
    )
  }
  return (
    <Box borderStyle="round">
      <Text>short-{index}</Text>
    </Box>
  )
}

function App({ scrollTo }: { scrollTo: number }): React.ReactElement {
  const items = Array.from({ length: 50 }, (_, i) => i)
  return (
    <Box flexDirection="column" height={30}>
      <Text>Header</Text>
      <Box
        overflow="scroll"
        height={28}
        scrollTo={scrollTo}
        overflowIndicator
        flexDirection="column"
      >
        {items.map((i) => (
          <Item key={i} index={i} />
        ))}
      </Box>
    </Box>
  )
}

describe("scroll snap to child-top (mixed-height, km-tui.column-top-disappears)", () => {
  test("forward scroll: indicator does not overwrite first visible card's top border", () => {
    const render = createRenderer({ cols: 40, rows: 30 })

    // Start at the top — offset=0, no indicator
    const app = render(<App scrollTo={0} />)
    const text0 = stripAnsi(app.text)
    expect(text0).toContain("tall-0")

    // Scroll far enough down to force scroll offset > 0. Target is at index
    // 20 (short-20), which is inside the container after several mixed
    // heights above it. This triggers the forward-scroll branch in
    // calculateScrollState.
    app.rerender(<App scrollTo={20} />)
    const textScrolled = stripAnsi(app.text)

    // Target must be visible
    expect(textScrolled).toContain("short-20")

    // TOP indicator must appear (we've scrolled past items 0..n)
    expect(textScrolled).toContain("▲")

    // Core invariant: the indicator row and the first visible card's top
    // border must NOT be on the same row. Scan line-by-line and assert that
    // whatever line contains "▲" does NOT also contain a ╭ char (top border).
    // A top-border getting overwritten by the indicator is the exact bug.
    const lines = textScrolled.split("\n")
    for (const line of lines) {
      if (line.includes("▲")) {
        expect(
          line.includes("╭"),
          `indicator row "${line}" also contains a top-border — mid-card clip bug`,
        ).toBe(false)
      }
    }
  })

  test("backward scroll: indicator does not overwrite target's top border", () => {
    const render = createRenderer({ cols: 40, rows: 30 })

    // First scroll far down so offset > 0 (target 31 is short: 31 % 3 === 1)
    const app = render(<App scrollTo={31} />)
    const textFar = stripAnsi(app.text)
    expect(textFar).toContain("short-31")

    // Now scroll BACKWARD to a target above the current viewport.
    // This hits the `target.top < visibleTop` branch which used to set
    // scrollOffset = target.top, placing the target AT row 0 where the
    // top indicator overwrites its top border.
    app.rerender(<App scrollTo={16} />)
    const textBack = stripAnsi(app.text)

    expect(textBack).toContain("short-16") // target visible (16 is short: 16 % 3 === 1)
    expect(textBack).toContain("▲")

    const lines = textBack.split("\n")
    for (const line of lines) {
      if (line.includes("▲")) {
        expect(
          line.includes("╭"),
          `indicator row "${line}" also contains a top-border — backward-scroll clip bug`,
        ).toBe(false)
      }
    }
  })

  test("incremental vs fresh: snap behavior is deterministic across many scrollTo changes", () => {
    // STRICT=2 buffers compare incremental vs fresh after every action. This
    // test exercises the snap logic repeatedly to ensure no accumulated drift.
    const render = createRenderer({ cols: 40, rows: 30 })

    const app = render(<App scrollTo={0} />)
    expect(stripAnsi(app.text)).toContain("tall-0")

    // Bounce cursor around — forward, backward, forward again
    const sequence = [5, 10, 15, 20, 25, 30, 25, 20, 10, 5, 0, 35, 40, 45, 49]
    for (const target of sequence) {
      app.rerender(<App scrollTo={target} />)
      const text = stripAnsi(app.text)
      // Target must always be rendered
      const isTall = target % 3 === 0
      const label = isTall ? `tall-${target}` : `short-${target}`
      expect(text, `scrollTo=${target} should keep ${label} visible`).toContain(label)

      // Indicator invariant: top indicator never on the same row as a ╭.
      const lines = text.split("\n")
      for (const line of lines) {
        if (line.includes("▲") && line.includes("╭")) {
          throw new Error(`scrollTo=${target}: indicator row overwrites a top-border: "${line}"`)
        }
      }
    }
  })
})
