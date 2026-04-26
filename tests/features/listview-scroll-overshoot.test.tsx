/**
 * Height-independent ListView — scroll cap MUST NOT overshoot actual content.
 *
 * Bead: km-silvery.listview-scroll-overshoot
 *
 * Regression from 8c63cfb9 (Stream M's tall-items scroll-cap fix). That fix
 * changed `scrollableRows` from `totalRowsMeasured - trackHeight` to
 * `max(totalRowsStable, totalRowsMeasured) - trackHeight` so the cap honours
 * measured-or-estimated content (whichever is larger). Correct for the
 * estimate=1 silvercode shape — but it surfaces a SECOND defect when
 * measurement-fallback `avgMeasured` is artificially inflated by an
 * atypically tall first item.
 *
 * Symptom (silvercode --resume with a long system prompt):
 *
 *   1. item[0] is the system prompt (~150 visual rows).
 *   2. item[1..n] are short user/assistant messages (~1-2 rows each).
 *   3. After only item[0] is measured, `avgMeasured = 150`. Unmeasured items
 *      below the viewport get assigned this 150-row fallback.
 *   4. `totalRowsMeasured` becomes `~150 + (n-1)*150 ≈ 150n` — many times
 *      larger than the actual content total of `~150 + n`.
 *   5. `max(stable, measured) - trackHeight` produces a cap far past content
 *      end. User wheel-scrolls past the last item; viewport renders a row
 *      window beyond the last item → ENTIRELY EMPTY viewport.
 *
 * Fix: scroll cap uses `totalRowsMeasured` directly (NOT max with stable).
 * The visibility gate keeps `max(stable, measured)` — false-negative on the
 * scrollbar during measurement ramp-up is bad (Stream J), but a scroll cap
 * that's briefly tight during ramp-up is a minor cosmetic issue. A scroll
 * cap that's TOO GENEROUS = severe (empty viewport).
 *
 * See companion: `listview-scrollcap-tall-items.test.tsx` — Stream M's tests
 * MUST still pass; they cover the case where stable underestimates and the
 * cap needs to honour measurements.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

/** A 30-row item — approximates a long system-prompt message. */
function TallItem({ idx }: { idx: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {Array.from({ length: 30 }, (_, i) => (
        <Text key={i}>
          tall {idx} line {i}
        </Text>
      ))}
    </Box>
  )
}

/** A 1-row item — approximates a short user message. */
function ShortItem({ idx }: { idx: number }): React.ReactElement {
  return <Text>short item {idx}</Text>
}

function screenContainsText(app: { text: string }, needle: string): boolean {
  return app.text.includes(needle)
}

/** Returns true if the visible viewport text is essentially blank (no item content). */
function viewportIsEmpty(app: { text: string }): boolean {
  // No "tall" or "short" content visible at all.
  return !app.text.includes("tall ") && !app.text.includes("short item")
}

describe("ListView height-independent — scroll cap MUST NOT overshoot content", () => {
  test("tall first item, short rest — wheel-scroll bottom MUST NOT enter empty viewport (silvercode resume shape)", async () => {
    const COLS = 60
    const ROWS = 20
    // 20 items: item[0] is 30 rows (system prompt shape); items[1..19] each
    // 1 row. Total real content rows: 30 + 19 = 49. With trackHeight=20,
    // real cap = 49 - 20 = 29.
    //
    // BEFORE FIX: after item[0] is measured, `avgMeasured = 30`. Unmeasured
    // items get this fallback. `totalRowsMeasured ≈ 30 + 19*30 = 600`,
    // `max(stable=20, measured=600) - track=20 = 580`. User wheels into
    // row 100+ → renderer's index window slides past last item → empty
    // viewport.
    //
    // AFTER FIX: cap = `totalRowsMeasured - trackHeight`. Still uses
    // avgMeasured fallback during ramp-up — so the cap can still drift
    // briefly — but in steady state once items are measured the cap
    // converges to the real bound, and we never combine with the inflated
    // `stable` value. Critically, this strictly improves the silvercode
    // shape where stable << measured and the max() pinned cap to measured.
    const N = 20
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              renderItem={(idx) => (idx === 0 ? <TallItem idx={idx} /> : <ShortItem idx={idx} />)}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness />)

    // Pre-scroll: tall item content visible.
    expect(screenContainsText(app, "tall 0 line 0")).toBe(true)

    // Wheel-scroll aggressively to the bottom — many small wheels with
    // re-render between (lets measurement land). 200 wheel ticks easily
    // exceeds true cap (29) but must not exceed actual content end.
    for (let i = 0; i < 200; i++) {
      await app.wheel(5, ROWS / 2, 1)
    }

    // After scroll: viewport MUST contain at least one item — never blank.
    // The last item ("short item 19") must be reachable; an empty state
    // would mean the cap let scrollRow walk past content end.
    expect(viewportIsEmpty(app)).toBe(false)
    expect(screenContainsText(app, "short item 19")).toBe(true)
  })

  test("mixed-height streaming append — last item reachable after items grow", async () => {
    const COLS = 60
    const ROWS = 20

    function Harness({ items }: { items: number[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              renderItem={(idx) => (idx === 0 ? <TallItem idx={idx} /> : <ShortItem idx={idx} />)}
            />
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Start with 5 items: tall + 4 short. Real rows = 30 + 4 = 34.
    let items = Array.from({ length: 5 }, (_, i) => i)
    const app = render(<Harness items={items} />)

    // Wheel hard — must reach last item, must NOT enter empty viewport.
    for (let i = 0; i < 100; i++) {
      await app.wheel(5, ROWS / 2, 1)
    }
    expect(viewportIsEmpty(app)).toBe(false)
    expect(screenContainsText(app, "short item 4")).toBe(true)

    // Append 5 more short items.
    items = Array.from({ length: 10 }, (_, i) => i)
    app.rerender(<Harness items={items} />)

    // Continue wheel — last item must remain reachable.
    for (let i = 0; i < 100; i++) {
      await app.wheel(5, ROWS / 2, 1)
    }
    expect(viewportIsEmpty(app)).toBe(false)
    expect(screenContainsText(app, "short item 9")).toBe(true)
  })

  test("homogeneous short items (no overshoot risk) — last item reachable", async () => {
    const COLS = 60
    const ROWS = 20
    // 30 single-line items. Real content = 30 rows; viewport = 20 rows;
    // real cap = 10.  No tall first item, so avgMeasured stays ~1, no
    // overshoot risk. Both old and new code should reach item 29.
    const N = 30
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(idx) => <ShortItem idx={idx} />} />
        </Box>
      </Box>,
    )

    expect(screenContainsText(app, "short item 0")).toBe(true)

    // Modest wheel count — homogeneous lists are well-bounded under both
    // pre/post-fix code; we just confirm the last item is reachable.
    for (let i = 0; i < 60; i++) {
      await app.wheel(5, ROWS / 2, 1)
    }

    expect(viewportIsEmpty(app)).toBe(false)
    expect(screenContainsText(app, `short item ${N - 1}`)).toBe(true)
  })
})
