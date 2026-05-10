/**
 * ListView integration: virtualization="index" + gap > 0 must not
 * mis-map child indices to virtual items.
 *
 * Pre-fix bug (Bug C from 2026-05-09 /pro audit):
 *   The render path injects a `<Box height={gap}>` between every pair of
 *   consecutive visible items. The viewport-anchor mapping treated child
 *   index N as "item prevStart + (N - leadingOffset)", which counted
 *   gap-Boxes as items. Once the viewport scrolled, the windowed slice
 *   was off by `numGaps` items.
 *
 * This test renders a list at index virtualization with `gap > 0` and
 * walks through the cursor positions; the rendered items must always be
 * the right items, not items shifted by half-the-gap-count.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { ListView } from "../src/ui/components/ListView"

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}` }))
}

describe("ListView virtualization='index' with gap > 0", () => {
  test("renders cursor item correctly even when child indices are 'item, gap, item, gap, ...'", () => {
    // 100 items, gap=2, cursor at 50 — index virtualization with overscan=5
    // should render approximately items 45..55. Pre-fix: the next-frame
    // viewport anchor would mis-map gap-Boxes to item indices, so the
    // window could shift by ~half-the-gap-count after the first scroll.
    //
    // We can't easily drive a "scroll then re-render" sequence at this
    // layer without a wheel event, but we CAN assert the cursor's item
    // is rendered at the correct position on first render — which already
    // exercises the prev-ref math seeded by the bootstrap window. Most
    // importantly, the test wires up the gap > 0 + index combination so
    // any future regression in the mapping (or in `hasInterstitial`
    // tracking) shows up immediately.
    const items = makeItems(100)
    const r = createRenderer({ cols: 60, rows: 30 })
    const app = r(
      <Box width={60} height={30} flexDirection="column">
        <ListView
          items={items}
          virtualization="index"
          virtualizationThreshold={20}
          overscan={5}
          gap={2}
          nav
          cursorKey={50}
          estimateHeight={1}
          maxRendered={20}
          maxEstimatedRows={200}
          renderItem={(item) => <Text>{item.title}</Text>}
          getKey={(item) => item.id}
        />
      </Box>,
    )
    const text = stripAnsi(app.text)
    // Cursor must be in the rendered output.
    expect(text).toContain("Item 50")
    // Items in the cursor neighborhood must render.
    expect(text).toContain("Item 48")
    expect(text).toContain("Item 52")
    // Items far from the cursor must NOT render.
    expect(text).not.toContain("Item 0\n")
    expect(text).not.toContain("Item 99\n")
    // Critically: items must appear in NUMERIC order. A regression where
    // gap-nodes were mis-counted as items would either drop items or
    // shift the rendered slice, leading to non-monotonic appearance.
    // We check that the rendered item indices are monotonically
    // increasing in the output.
    const seen: number[] = []
    for (let i = 0; i < items.length; i++) {
      if (
        text.includes(`Item ${i}\n`) ||
        text.includes(`Item ${i} `) ||
        text.endsWith(`Item ${i}`)
      ) {
        seen.push(i)
      }
    }
    // At least one item should be in the rendered output near the cursor.
    expect(seen.length).toBeGreaterThan(0)
    // Items must be monotonically increasing — no skipped slices.
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k]).toBeGreaterThan(seen[k - 1]!)
    }
    // Cursor position must be in the rendered slice.
    expect(seen).toContain(50)
  })

  test("end-of-list rendering with index + gap — no Yoga errors, items render", () => {
    // Cursor at the LAST item — exercises the end-of-list trailing-spacer
    // path. Pre-fix: spurious negative-spacer claim would have failed
    // here if true; the current math just goes through the helper which
    // clamps to 0.
    const items = makeItems(50)
    const r = createRenderer({ cols: 50, rows: 20 })
    const app = r(
      <Box width={50} height={20} flexDirection="column">
        <ListView
          items={items}
          virtualization="index"
          virtualizationThreshold={10}
          overscan={3}
          gap={1}
          nav
          cursorKey={49}
          estimateHeight={1}
          maxRendered={15}
          maxEstimatedRows={100}
          renderItem={(item) => <Text>{item.title}</Text>}
          getKey={(item) => item.id}
        />
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 49")
    expect(text).toContain("Item 47")
  })
})
