/**
 * Absolute-positioned nodes participate in hit testing by geometry, not tree order.
 *
 * When an absolutely-positioned element is rendered outside its parent's
 * bounding box (e.g., a popover anchored near a viewport edge whose provider
 * wraps a smaller container), hit testing must still resolve the absolute
 * node — its parent's rect does NOT clip it.
 *
 * This mirrors DOM behaviour: `position: absolute` nodes are taken out of
 * flow and hit-tested by their own geometry. Without this, mouseEnter /
 * mouseLeave never fire on overlays positioned outside their ancestor's
 * rect, forcing consumers to hand-roll a bounding-box re-check + timer
 * (as km's PopoverOverlay did before this was fixed).
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

describe("hit test: absolute-positioned nodes escape parent bounds", () => {
  test("mouseEnter fires on absolute child outside its parent's rect", async () => {
    let entered = false
    let left = false

    const render = createRenderer({ cols: 40, rows: 20 })
    // A small in-flow wrapper at top-left contains an absolute child whose
    // computed position (via marginTop/marginLeft) is OUTSIDE the wrapper's
    // bounding rect. The absolute child occupies real screen cells and MUST
    // be hittable regardless of the wrapper's size.
    const app = render(
      <Box flexDirection="column" width={40} height={20}>
        <Box width={4} height={1}>
          <Text>P</Text>
          <Box
            position="absolute"
            marginTop={10}
            marginLeft={15}
            width={8}
            height={3}
            borderStyle="round"
            id="overlay"
            onMouseEnter={() => {
              entered = true
            }}
            onMouseLeave={() => {
              left = true
            }}
          >
            <Text>Overlay</Text>
          </Box>
        </Box>
      </Box>,
    )

    // Note: "Overlay" may wrap inside the 8-wide box; we only care about hit testing.

    // Move into the overlay region. The overlay sits around (15..22, 10..12).
    await app.hover(18, 11)
    expect(entered).toBe(true)

    // Move away to a cell that is definitely outside the overlay.
    await app.hover(0, 0)
    expect(left).toBe(true)
  })

  test("mouseEnter fires on popover overlay that sits across the screen from its anchor", async () => {
    let popoverEntered = false
    let popoverLeft = false

    function App() {
      const [hover, setHover] = useState(false)
      return (
        <Box flexDirection="column" width={40} height={20}>
          <Box
            id="anchor"
            width={6}
            height={1}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <Text>Anchor</Text>
          </Box>
          {/* Simulate the real km popover: provider wraps app, popover is a
              sibling absolutely-positioned *elsewhere*. The popover lives as a
              sibling of a small anchor Box — its absolute position is far from
              its own parent's natural rect. */}
          {hover ? (
            <Box
              id="popover"
              position="absolute"
              marginTop={12}
              marginLeft={20}
              width={15}
              height={4}
              borderStyle="round"
              onMouseEnter={() => {
                popoverEntered = true
              }}
              onMouseLeave={() => {
                popoverLeft = true
              }}
            >
              <Text>Popover body</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(<App />)

    // Hover the anchor to open the popover
    await app.hover(2, 0)
    expect(app.text).toContain("Popover body")

    // Now move into the popover (which is at (20..34, 12..15))
    await app.hover(24, 13)
    expect(popoverEntered).toBe(true)

    // Move far away — leave should fire.
    await app.hover(0, 19)
    expect(popoverLeft).toBe(true)
  })

  test("topmost absolute wins when two absolute nodes overlap", async () => {
    let bottomEntered = false
    let topEntered = false

    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <Box width={40} height={20}>
        {/* Bottom absolute layer */}
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={5}
          width={20}
          height={6}
          id="bottom"
          onMouseEnter={() => {
            bottomEntered = true
          }}
        >
          <Text>Bottom</Text>
        </Box>
        {/* Top absolute layer — rendered after, so last-child = top z */}
        <Box
          position="absolute"
          marginTop={7}
          marginLeft={10}
          width={10}
          height={3}
          id="top"
          onMouseEnter={() => {
            topEntered = true
          }}
        >
          <Text>Top</Text>
        </Box>
      </Box>,
    )

    // Hover a cell contained by BOTH absolute boxes — expect only the top to enter
    await app.hover(12, 8)
    expect(topEntered).toBe(true)
    expect(bottomEntered).toBe(false)
  })

  test("absolute node nested under tight parent — hitTest ignores parent's rect for absolute descendants", async () => {
    let entered = false

    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <Box width={40} height={20}>
        {/* small in-flow parent */}
        <Box width={4} height={1}>
          <Text>P</Text>
          {/* absolute escapee */}
          <Box
            position="absolute"
            marginTop={10}
            marginLeft={15}
            width={6}
            height={3}
            id="escapee"
            onMouseEnter={() => {
              entered = true
            }}
          >
            <Text>Escape</Text>
          </Box>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("Escape")

    // Hover inside the escapee — its direct parent's rect is only 4x1 at (0,0),
    // so the parent does NOT contain this point. Hit test must still find the
    // absolute descendant by geometry.
    await app.hover(17, 11)
    expect(entered).toBe(true)
  })
})
