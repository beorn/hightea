/**
 * ListView real-input trackpad flick reproduction.
 *
 * This uses createTermless() and the mouse.trackpadFlick() backend so the test
 * replays timestamped SGR-Pixels wheel packet groups, not direct App.wheel()
 * calls or 50ms bucket approximations.
 */

import React, { act } from "react"
import { describe, expect, test } from "vitest"
import { createTermless, type TermlessTrackpadFlickProfile } from "@silvery/test"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { Box, ListView, Text } from "../../src/index"
import type { ListViewHandle } from "../../packages/ag-react/src/ui/components/ListView"

interface RowItem {
  id: string
  label: string
  height: number
}

const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const USER_LOG_SINGLE_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 40,
  y: 76,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 8, height: 17 },
  packets: [
    { atMs: 0, count: 1, direction: "up" },
    { atMs: 1, count: 1, direction: "up" },
    { atMs: 1, count: 1, button: 67, direction: "down" },
    { atMs: 37, count: 1, direction: "up" },
    { atMs: 38, count: 11, direction: "up" },
    { atMs: 77, count: 20, direction: "up" },
    { atMs: 78, count: 1, direction: "up" },
    { atMs: 117, count: 13, direction: "up" },
    { atMs: 118, count: 3, direction: "up" },
    { atMs: 154, count: 12, direction: "up" },
    { atMs: 189, count: 11, direction: "up" },
    { atMs: 228, count: 10, direction: "up" },
    { atMs: 266, count: 8, direction: "up" },
    { atMs: 303, count: 3, direction: "up" },
    { atMs: 304, count: 4, direction: "up" },
    { atMs: 367, count: 8, direction: "up" },
    { atMs: 435, count: 7, direction: "up" },
    { atMs: 509, count: 4, direction: "up" },
    { atMs: 558, count: 3, direction: "up" },
    { atMs: 560, count: 1, direction: "up" },
    { atMs: 626, count: 3, direction: "up" },
    { atMs: 688, count: 1, direction: "up" },
    { atMs: 731, count: 1, direction: "up" },
    { atMs: 767, count: 1, direction: "up" },
    { atMs: 800, count: 1, direction: "up" },
    { atMs: 859, count: 1, direction: "up" },
    { atMs: 902, count: 1, direction: "up" },
    { atMs: 1000, count: 1, direction: "up" },
    { atMs: 1133, count: 1, direction: "up" },
  ],
}

function makeVariableRows(count: number): RowItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    label: `Line ${String(index).padStart(4, "0")}`,
    height: index % 13 === 0 ? 14 : index % 5 === 0 ? 8 : 2 + (index % 4),
  }))
}

function FlickList({
  items,
  listRef,
}: {
  items: readonly RowItem[]
  listRef: React.RefObject<ListViewHandle | null>
}): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<RowItem>
        ref={listRef}
        items={[...items]}
        estimateHeight={1}
        getKey={(item) => item.id}
        follow="end"
        virtualization="index"
        viewportBottomInset={5}
        scrollbarVisibility="always"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.label}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function visibleLineNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const match of text.matchAll(/Line\s+(\d+)/g)) {
    numbers.push(Number(match[1]))
  }
  return numbers
}

function newestVisibleLine(text: string): number | null {
  const numbers = visibleLineNumbers(text)
  return numbers.length === 0 ? null : Math.max(...numbers)
}

describe("ListView trackpad flick replay through termless", () => {
  test("does not add a large idle-handoff jump after a captured upward flick", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeVariableRows(1265)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; newest: number | null; eventCount: number }[] = [
        { label: "initial", newest: newestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_SINGLE_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            newest: newestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(1000)
      samples.push({
        label: "settled",
        newest: newestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      expect(result.eventCount).toBe(134)
      expect(samples[0]?.newest).not.toBeNull()
      expect(samples.at(-1)?.newest).toBeLessThan(samples[0]!.newest!)

      const beforeSettled = samples[samples.length - 2]!
      const settled = samples.at(-1)!
      const handoffJump =
        beforeSettled.newest === null || settled.newest === null
          ? 0
          : Math.abs(settled.newest - beforeSettled.newest)
      expect(
        handoffJump,
        samples
          .slice(-8)
          .map((sample) => `${sample.label}@${sample.eventCount}:${sample.newest}`)
          .join(", "),
      ).toBeLessThanOrEqual(8)
    } finally {
      handle.unmount()
    }
  }, 20_000)
})
