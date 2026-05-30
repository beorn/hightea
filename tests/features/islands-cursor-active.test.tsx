/**
 * Island `cursorActive` — host-designated island cursor independent of input
 * focus (@km/silvery/19426). A `cursorActive` island renders its guest cursor
 * as the host hardware caret via `findActiveCursorRect`, WITHOUT being
 * silvery-focused (which would route input to the island and bypass a host's
 * own key handling — silvermux's prefix model). The host owns the one-cursor
 * invariant (at most one island carries `cursorActive`).
 */

import React, { type ReactElement, type ReactNode } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Island, ScopeProvider } from "@silvery/ag-react"
import { createScope } from "@silvery/scope"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { findActiveCursorRect } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"
import type { IslandGuest, IslandHandle } from "@silvery/ag/island-types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function withScope(children: ReactNode): ReactElement {
  return <ScopeProvider scope={createScope("island-cursor-test")}>{children}</ScopeProvider>
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function cursorGuest(col: number, row: number, visible = true): IslandGuest {
  return {
    capabilities: { input: true, modes: true },
    init(ctx) {
      const handle: IslandHandle = {
        size: {
          get cols() {
            return ctx.cols
          },
          get rows() {
            return ctx.rows
          },
          subscribe: () => () => {},
          requestResize: () => {},
        },
        output: {
          buffer: createCellBuffer(ctx.cols, ctx.rows),
          cursor: { col, row, style: "block" },
          cursorVisible: visible,
          subscribe: () => () => {},
          writeCells: () => {},
          invalidateAll: () => {},
        },
        input: { feed: () => {} },
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
}

describe("Island cursorActive (19426)", () => {
  test("renders the guest cursor at the island's screen rect + cursor offset", async () => {
    const render = createRenderer({ cols: 60, rows: 12 })
    const guest = cursorGuest(3, 1)
    const tree = withScope(
      <Box padding={2}>
        <Island guest={guest} cols={20} rows={5} cursorActive />
      </Box>,
    )
    const app = render(tree)
    await flush()
    app.rerender(tree)
    await flush()

    const root = getRoot(app)
    const islandNode = app.locator("silvery-island").resolve()
    const box = islandNode?.boxRect
    const cursor = findActiveCursorRect(root)

    expect(cursor).not.toBeNull()
    expect(cursor?.visible).toBe(true)
    // Island-local cursor (3, 1) translated into the island's screen rect.
    expect(cursor?.x).toBe((box?.x ?? -1) + 3)
    expect(cursor?.y).toBe((box?.y ?? -1) + 1)
  })

  test("no caret when cursorActive is omitted", async () => {
    const render = createRenderer({ cols: 60, rows: 12 })
    const guest = cursorGuest(3, 1)
    const tree = withScope(
      <Box padding={2}>
        <Island guest={guest} cols={20} rows={5} />
      </Box>,
    )
    const app = render(tree)
    await flush()
    app.rerender(tree)
    await flush()
    expect(findActiveCursorRect(getRoot(app))).toBeNull()
  })

  test("no caret when the guest cursor is hidden, even with cursorActive", async () => {
    const render = createRenderer({ cols: 60, rows: 12 })
    const guest = cursorGuest(3, 1, false) // cursorVisible: false
    const tree = withScope(
      <Box padding={2}>
        <Island guest={guest} cols={20} rows={5} cursorActive />
      </Box>,
    )
    const app = render(tree)
    await flush()
    app.rerender(tree)
    await flush()
    expect(findActiveCursorRect(getRoot(app))).toBeNull()
  })

  test("one-cursor: with two islands, only the cursorActive one yields a caret", async () => {
    const render = createRenderer({ cols: 80, rows: 12 })
    const active = cursorGuest(2, 0)
    const inactive = cursorGuest(7, 3)
    const tree = withScope(
      <Box flexDirection="row" padding={1}>
        <Island guest={inactive} cols={20} rows={5} />
        <Island guest={active} cols={20} rows={5} cursorActive />
      </Box>,
    )
    const app = render(tree)
    await flush()
    app.rerender(tree)
    await flush()

    const root = getRoot(app)
    const islands = app.locator("silvery-island").resolveAll()
    const activeNode = islands[1]! // second island is the cursorActive one
    const cursor = findActiveCursorRect(root)
    expect(cursor).not.toBeNull()
    // The caret belongs to the cursorActive island (local 2,0), not the other.
    expect(cursor?.x).toBe((activeNode.boxRect?.x ?? -1) + 2)
    expect(cursor?.y).toBe((activeNode.boxRect?.y ?? -1) + 0)
  })
})
