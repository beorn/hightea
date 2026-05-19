/**
 * useCursor multi-instance race regression (km-silvery.13011-usecursor-race).
 *
 * The bug: rendering N silvery components that call useCursor as siblings,
 * with only ONE marked visible/active, resulted in NO cursor visible
 * anywhere — because inactive instances' mount-time effects (visible=false)
 * cleared the cursor state via setRef.current(null), stomping the active
 * instance's writes (last-writer-wins).
 *
 * Fix: useCursor stamps an `owner` id on every store write; the clear-
 * on-hide and clear-on-unmount branches only fire when getRef().owner
 * === thisInstanceId.
 *
 * These tests pin the multi-instance behavior.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useCursor } from "silvery"

function CursorEntry({ active, col }: { active: boolean; col: number }): React.ReactElement {
  useCursor({ col, row: 0, visible: active })
  return (
    <Box>
      <Text>{active ? "[*]" : "[ ]"}</Text>
    </Box>
  )
}

describe("useCursor multi-instance race (13011-usecursor-race)", () => {
  test("active sibling among N inactive siblings: cursor visible on the active one", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    const app = render(
      <Box flexDirection="column">
        <CursorEntry active={true} col={2} />
        <CursorEntry active={false} col={5} />
        <CursorEntry active={false} col={7} />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor, "cursor must be set by the single active instance").not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(2)
  })

  test("active sibling NOT first in render order — still wins", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    const app = render(
      <Box flexDirection="column">
        <CursorEntry active={false} col={1} />
        <CursorEntry active={false} col={3} />
        <CursorEntry active={true} col={6} />
        <CursorEntry active={false} col={9} />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(6)
  })

  test("toggling active sibling: cursor follows the active instance", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function Harness({ activeIdx }: { activeIdx: number }): React.ReactElement {
      return (
        <Box flexDirection="column">
          <CursorEntry active={activeIdx === 0} col={2} />
          <CursorEntry active={activeIdx === 1} col={5} />
          <CursorEntry active={activeIdx === 2} col={9} />
        </Box>
      )
    }

    const app = render(<Harness activeIdx={0} />)
    expect(app.getCursorState()?.x).toBe(2)

    app.rerender(<Harness activeIdx={2} />)
    const cursor2 = app.getCursorState()
    expect(cursor2, "cursor must follow active sibling on rerender").not.toBeNull()
    expect(cursor2!.visible).toBe(true)
    expect(cursor2!.x).toBe(9)
  })

  test("inactive sibling unmount does NOT clear active sibling's cursor", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function Harness({ showInactive }: { showInactive: boolean }): React.ReactElement {
      return (
        <Box flexDirection="column">
          <CursorEntry active={true} col={4} />
          {showInactive ? <CursorEntry active={false} col={7} /> : null}
        </Box>
      )
    }

    const app = render(<Harness showInactive={true} />)
    expect(app.getCursorState()?.x).toBe(4)

    // Unmount the inactive sibling — active sibling's cursor must survive.
    app.rerender(<Harness showInactive={false} />)
    const cursor = app.getCursorState()
    expect(cursor, "active sibling's cursor must survive inactive unmount").not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(4)
  })

  test("active sibling unmount clears cursor (only-owner-can-clear semantics)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function Harness({ showActive }: { showActive: boolean }): React.ReactElement {
      return (
        <Box flexDirection="column">
          {showActive ? <CursorEntry active={true} col={3} /> : null}
          <CursorEntry active={false} col={6} />
        </Box>
      )
    }

    const app = render(<Harness showActive={true} />)
    expect(app.getCursorState()?.x).toBe(3)

    // Unmount the active sibling — its cleanup clears (it was the owner).
    app.rerender(<Harness showActive={false} />)
    expect(app.getCursorState(), "cursor must clear when its owner unmounts").toBeNull()
  })
})
