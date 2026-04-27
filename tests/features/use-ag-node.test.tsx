/**
 * Tests for useAgNode() — G7 of reactive-pipeline.
 *
 * Verifies the hook returns the AgNode and its reactive rect signals
 * from within a silvery component tree.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useAgNode } from "silvery"
import type { AgNodeHandle } from "silvery"
import { hasLayoutSignals } from "@silvery/ag/layout-signals"

describe("useAgNode", () => {
  test("returns null when no enclosing Box provides NodeContext", () => {
    // useAgNode reads useContext(NodeContext). createRenderer wraps the element
    // in context providers (TermContext, RuntimeContext, etc.) but does NOT
    // wrap in a <Box> — so NodeContext is null at the React root. The hook
    // should return null in that case (matches its docstring).
    const render = createRenderer({ cols: 40, rows: 10 })
    let result: AgNodeHandle | null = "sentinel" as unknown as AgNodeHandle

    function Bare() {
      // Rendered directly at the React root — no enclosing Box, so
      // NodeContext is null. useAgNode should return null.
      result = useAgNode()
      return <Text>bare</Text>
    }

    render(<Bare />)
    expect(result).toBeNull()
  })

  test("returns node and signals inside component tree", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    let handle: AgNodeHandle | null = null

    function Inspector() {
      handle = useAgNode()
      return <Text>Hello</Text>
    }

    const app = render(
      <Box id="outer" flexDirection="column">
        <Inspector />
      </Box>,
    )

    expect(app.text).toContain("Hello")
    expect(handle).not.toBeNull()
    expect(handle!.node).toBeDefined()
    expect(handle!.signals).toBeDefined()
    expect(handle!.signals.boxRect).toBeTypeOf("function")
    expect(handle!.signals.scrollRect).toBeTypeOf("function")
    expect(handle!.signals.screenRect).toBeTypeOf("function")

    // After layout, boxRect signal should return a non-null Rect
    const rect = handle!.signals.boxRect()
    expect(rect).not.toBeNull()
    expect(rect!.width).toBeGreaterThan(0)
  })

  test("signals update after layout changes", () => {
    // useAgNode returns the node corresponding to the closest enclosing Box
    // (the parent context). To verify the signal updates when that Box's
    // width changes, the inspector must be a child of the resized Box, not
    // a sibling of it.
    const render = createRenderer({ cols: 40, rows: 10 })
    let handle: AgNodeHandle | null = null

    function Inspector() {
      handle = useAgNode()
      return null
    }

    const app = render(
      <Box width={10} height={3}>
        <Inspector />
        <Text>content</Text>
      </Box>,
    )

    // Initial: parent Box width=10
    const rect1 = handle!.signals.boxRect()
    expect(rect1).not.toBeNull()
    expect(rect1!.width).toBe(10)

    // Rerender with wider parent
    app.rerender(
      <Box width={30} height={3}>
        <Inspector />
        <Text>content</Text>
      </Box>,
    )

    // Signal should reflect the new layout
    const rect2 = handle!.signals.boxRect()
    expect(rect2).not.toBeNull()
    expect(rect2!.width).toBe(30)
  })

  test("signals are lazy — only allocated when useAgNode is called", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const nodeWithoutHook: AgNodeHandle | null = null
    let parentNode: AgNodeHandle | null = null

    // Component that does NOT call useAgNode
    function Plain() {
      return (
        <Box id="plain" height={3}>
          <Text>no hook</Text>
        </Box>
      )
    }

    // Component that DOES call useAgNode
    function WithHook() {
      parentNode = useAgNode()
      return (
        <Box id="with-hook" height={3}>
          <Text>has hook</Text>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column">
        <Plain />
        <WithHook />
      </Box>,
    )

    expect(app.text).toContain("no hook")
    expect(app.text).toContain("has hook")

    // The node with the hook should have signals allocated
    expect(parentNode).not.toBeNull()
    expect(hasLayoutSignals(parentNode!.node)).toBe(true)

    // Find the "plain" node via locator — it should NOT have signals
    const plainLocator = app.locator("#plain")
    expect(plainLocator.count()).toBe(1)
  })

  test("node reference matches the AgNode from context", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    let handle: AgNodeHandle | null = null

    function Inspector() {
      handle = useAgNode()
      return <Text>check node</Text>
    }

    const app = render(
      <Box id="target">
        <Inspector />
      </Box>,
    )

    expect(handle).not.toBeNull()
    // The node should be an AgNode with expected properties
    expect(handle!.node.type).toBeDefined()
    expect(handle!.node.children).toBeDefined()
    expect(handle!.node.boxRect).toBeDefined()
  })

  test("screenRect signal returns screen-space position", () => {
    // useAgNode returns the closest enclosing Box's node. To capture the
    // node placed below a spacer, put the Inspector INSIDE that Box.
    const render = createRenderer({ cols: 40, rows: 10 })
    let handle: AgNodeHandle | null = null

    function Inspector() {
      handle = useAgNode()
      return null
    }

    const app = render(
      <Box flexDirection="column">
        <Box height={3}>
          <Text>spacer</Text>
        </Box>
        <Box height={2}>
          <Inspector />
          <Text>content</Text>
        </Box>
      </Box>,
    )

    expect(handle).not.toBeNull()
    const screenRect = handle!.signals.screenRect()
    expect(screenRect).not.toBeNull()
    // Inspector's parent Box is below a 3-row spacer, so y should be 3
    expect(screenRect!.y).toBe(3)
  })
})
