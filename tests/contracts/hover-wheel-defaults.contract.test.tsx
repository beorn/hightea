/**
 * Defaults contract — `app.hover()` and `app.wheel()` modifier-options bag.
 *
 * See tests/contracts/README.md for the convention.
 *
 * `app.hover(x, y, options?)` and `app.wheel(x, y, delta, options?)` accept
 * `{ shift, meta, ctrl, cmd }` for parity with `app.click` /
 * `app.doubleClick`. Each option defaults to `false`. The contract pinned
 * here:
 *
 *   - `app.hover(x, y)` (omitted options) → MouseEvent shift/ctrl/alt/meta
 *     all `false`
 *   - `app.wheel(x, y, delta)` (omitted options) → same
 *   - `app.hover(x, y, { cmd: true })` followed by `app.hover(x, y)`
 *     drops `metaKey` cleanly (no leakage of held-Super state into a
 *     subsequent un-modified hover)
 *   - `app.wheel(x, y, delta, { cmd: true })` followed by
 *     `app.wheel(x, y, delta)` drops `metaKey` cleanly
 *
 * Bead: @km/silvery/test-api-plateau/defaults-contract-hover-wheel-modifiers.
 *
 * Phase 2 backlog: extend to multi-modifier combinations
 * (`{ shift: true, ctrl: true }` → both flags surfaced), wheel-direction
 * × modifier-flag matrix.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

type MoveArgs = Parameters<NonNullable<import("@silvery/ag/types").BoxProps["onMouseMove"]>>[0]
type WheelArgs = Parameters<NonNullable<import("@silvery/ag/types").BoxProps["onWheel"]>>[0]

describe("contract: app.hover modifier options default to false", () => {
  test("contract: app.hover(x, y) without options — all modifier flags false", async () => {
    const events: MoveArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onMouseMove={(e) => events.push(e)}>
          <Text>Hover target</Text>
        </Box>
      </Box>,
    )

    await app.hover(2, 0)

    expect(events.length).toBe(1)
    expect(events[0]?.shiftKey).toBe(false)
    expect(events[0]?.ctrlKey).toBe(false)
    expect(events[0]?.altKey).toBe(false)
    expect(events[0]?.metaKey).toBe(false)
  })

  test("contract: cmd:true followed by hover() drops metaKey — no leakage", async () => {
    const events: MoveArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onMouseMove={(e) => events.push(e)}>
          <Text>Hover target</Text>
        </Box>
      </Box>,
    )

    await app.hover(2, 0, { cmd: true })
    await app.hover(3, 0)

    expect(events.length).toBe(2)
    expect(events[0]?.metaKey).toBe(true)
    expect(events[1]?.metaKey).toBe(false)
  })
})

describe("contract: app.wheel modifier options default to false", () => {
  test("contract: app.wheel(x, y, delta) without options — all modifier flags false", async () => {
    const events: WheelArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onWheel={(e) => events.push(e)}>
          <Text>Wheel target</Text>
        </Box>
      </Box>,
    )

    await app.wheel(2, 0, -1)

    expect(events.length).toBe(1)
    expect(events[0]?.shiftKey).toBe(false)
    expect(events[0]?.ctrlKey).toBe(false)
    expect(events[0]?.altKey).toBe(false)
    expect(events[0]?.metaKey).toBe(false)
  })

  test("contract: cmd:true followed by wheel() drops metaKey — no leakage", async () => {
    const events: WheelArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onWheel={(e) => events.push(e)}>
          <Text>Wheel target</Text>
        </Box>
      </Box>,
    )

    await app.wheel(2, 0, -1, { cmd: true })
    await app.wheel(2, 0, 1)

    expect(events.length).toBe(2)
    expect(events[0]?.metaKey).toBe(true)
    expect(events[1]?.metaKey).toBe(false)
  })
})
