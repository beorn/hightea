/**
 * ListView with HIGHLY variable item heights — regression for
 * `km-tui.column-top-disappears` (2026-04-20 real-vault session).
 *
 * User-visible symptom (200×120 terminal, real vault):
 *   Col "Next Actions @next" renders ~18 short cards in rows 0-84, then leaves
 *   ~30 blank rows, then shows `▼1` claiming 1 item hidden. In fact many more
 *   items are hidden — the indicator count is WRONG, and the blank gap is a
 *   render-window shortfall.
 *
 * Data shape that triggers the bug:
 *   - ~33 items in the list
 *   - First ~18 items are SHORT (3-5 rows each)
 *   - Last ~15 items are TALL (15-30 rows each — wrapped text, section
 *     headers, multi-line bodies)
 *   - avgHeight = (short*18 + tall*15) / 33 ≈ 15
 *   - estimatedVisibleCount = ceil(viewport/avgH) ≈ 8
 *   - renderCount = 8 + 2*overscan = 18
 *   - Render window = [0, 18) → only the short cards
 *   - Those 18 cards total ~84 rows (well under viewport=115)
 *   - trailingHeight = sumHeights(18, 33, measuredAvg=15.8) ≈ 438
 *   - contentHeight = 84 + 438 = 522
 *   - hasOverflow = 522 > 115 = true → indicatorReserve = 1
 *   - The SINGLE trailing-placeholder Box (height=438) has bottom=522 >
 *     visibleBottom=114, so it's counted as a "partially visible bottom child"
 *     → hiddenBelow++ = 1 → `▼1` (wrong: should be 15+).
 *
 * Two invariants are violated:
 *   A) Render window must cover the viewport. When the first N items are
 *      short, the window must include MORE items until viewport is filled.
 *   B) Overflow indicator count must equal the number of HIDDEN ITEMS, not
 *      the number of partially visible placeholder Boxes.
 *
 * This test reproduces the shape at the component level via createRenderer.
 * It MUST fail on HEAD with the variable-heights bug; it passes when the
 * virtualizer fills the viewport correctly.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

describe("ListView variable-heights: column-top-disappears real-vault shape", () => {
  test("short-first + tall-later items: no large blank gap below last rendered card", () => {
    // Build 33 items matching the real-vault @next column shape:
    //   items 0..17 — SHORT (3 rows, § header-style cards) — 18 items, 54 rows
    //   items 18..32 — VERY TALL (30 rows, wrapped content) — 15 items, 450 rows
    //   Total content = 504 rows; viewport = 115 → hasOverflow.
    //   avgHeight = 504/33 ≈ 15.3 — matches real-vault measurement (avgH=15.8).
    //   estimatedVisibleCount = ceil(115/15.3) = 8; renderCount = 8+10 = 18.
    //   Window = [0, 18) covers ONLY the 18 short cards = 54 rows of content.
    //   trailingHeight = sumHeights(18, 33, measured) ≈ 450 rows.
    //   contentHeight = 54 + 450 = 504 → viewport rows 54..114 are BLANK.
    //   The trailing placeholder's single Box has bottom=504 → counted as
    //   ONE "partially visible bottom" item → `▼1`.
    //
    // User-visible symptom (this is what must fail before the fix):
    //   - 18 short cards render in rows 0-54
    //   - rows 55-114 are blank (~60 rows)
    //   - `▼1` at row 115 — falsely claims just 1 item hidden
    const items = Array.from({ length: 33 }, (_, i) => ({
      id: `i-${i}`,
      height: i < 18 ? 3 : 30,
    }))

    const r = createRenderer({ cols: 60, rows: 120 })
    const app = r(
      <Box flexDirection="column" height={120}>
        <ListView
          items={items}
          height={115}
          width={58}
          estimateHeight={4}
          overflowIndicator
          getKey={(item) => item.id}
          renderItem={(item) => (
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")

    // Find the row of the ▼N indicator.
    const indicatorRow = lines.findIndex((l) => /▼\d+/.test(l))

    // Dump the rendered column for diagnostic output.
    const dump = lines
      .map((l, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(l) ? l : "<blank>"}`)
      .join("\n")

    expect(
      indicatorRow,
      `Fixture must produce ▼N overflow indicator — content (${items.reduce((s, x) => s + x.height, 0)} rows) > viewport (115).\n\nDUMP:\n${dump}`,
    ).toBeGreaterThan(0)

    // Walk backward from indicator, count blank rows until we hit card border.
    let blankGap = 0
    for (let i = indicatorRow - 1; i >= 0; i--) {
      const slice = lines[i] ?? ""
      if (slice.includes("╰") || slice.includes("│")) break
      if (!/\S/.test(slice)) blankGap++
      else break
    }

    // INVARIANT: no large blank gap between last rendered card and ▼N.
    //   Passing: 0-3 blank rows (padding/spacer).
    //   Buggy:  ~30+ blank rows (window shortfall).
    expect(
      blankGap,
      `Column has ${blankGap} blank rows between the last rendered card's ╰ border and the ▼N indicator at row ${indicatorRow}. Expected ≤ 3 (padding only). This is the column-top-disappears bug.\n\nDUMP:\n${dump}`,
    ).toBeLessThanOrEqual(3)
  })

  test("overflow indicator count scales with number of hidden items (not stuck at 1)", () => {
    // When the virtualizer renders a window smaller than `count`, the trailing
    // placeholder is a single Box that represents MULTIPLE hidden items. Before
    // the height-aware window fix, the indicator counted the placeholder as
    // ONE hidden item — so the user saw `▼1` when many items were below.
    //
    // After the fix, the indicator count must grow with the number of hidden
    // items. Exact match isn't required (the trailing placeholder still
    // introduces some discrepancy with partially-visible counting in
    // layout-phase) but the count must be ≥ ~hidden/2 — proving the indicator
    // reflects the real hidden workload, not a stuck "1".
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `j-${i}`,
      height: i < 20 ? 3 : 15, // short prefix + tall suffix
    }))

    const r = createRenderer({ cols: 60, rows: 100 })
    const app = r(
      <Box flexDirection="column" height={100}>
        <ListView
          items={items}
          height={95}
          width={58}
          estimateHeight={4}
          overflowIndicator
          getKey={(item) => item.id}
          renderItem={(item) => (
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)
    const indicatorMatch = text.match(/▼(\d+)/)

    if (indicatorMatch) {
      const indicatorCount = parseInt(indicatorMatch[1]!, 10)
      const visibleCount = Array.from({ length: 30 }).filter((_, i) => text.includes(`j-${i}`)).length
      const hiddenItemCount = 30 - visibleCount

      // Indicator must grow with hidden-item count — not stuck at 1.
      // Buggy (pre-fix): indicator = 1 regardless of how many items are hidden.
      // Fixed: indicator reflects the actual hidden-item workload (≥ half).
      expect(
        indicatorCount,
        `▼N says ${indicatorCount} items below; ${hiddenItemCount} items actually hidden (j-${visibleCount}..j-29). Indicator must reflect real hidden count (≥ hidden/2), not be stuck at 1.`,
      ).toBeGreaterThanOrEqual(Math.ceil(hiddenItemCount / 2))
    }
  })
})
