import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { AnchoredOverlay, Box, Text } from "@silvery/ag-react"
import type { AgNode, BoxProps } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findById(node: AgNode, id: string): AgNode | null {
  const props = node.props as BoxProps | undefined
  if (props?.id === id) return node
  for (const child of node.children) {
    const hit = findById(child, id)
    if (hit !== null) return hit
  }
  return null
}

describe("AnchoredOverlay", () => {
  test("renders overlay content at the anchor decoration rect", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box anchorRef="trigger" width={10} height={2}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay anchorId="trigger" size={{ width: 8, height: 2 }} id="overlay">
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(app.text).toContain("menu")
    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 1,
      y: 3,
      width: 8,
      height: 2,
    })
  })

  test("uses flip-then-shift collision by default", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box width={20} height={10}>
        <Box marginTop={8} marginLeft={14} anchorRef="edge" width={4} height={1}>
          <Text>btn</Text>
        </Box>
        <AnchoredOverlay
          anchorId="edge"
          placement="bottom-end"
          alignOffset={6}
          size={{ width: 8, height: 3 }}
          id="overlay"
        >
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(findById(getRoot(app), "overlay")?.boxRect).toEqual({
      x: 12,
      y: 5,
      width: 8,
      height: 3,
    })
  })

  test("removes overlay content when closed", () => {
    const render = createRenderer({ cols: 40, rows: 14 })

    const app = render(
      <Box width={40} height={14} padding={1}>
        <Box anchorRef="trigger" width={10} height={2}>
          <Text>trigger</Text>
        </Box>
        <AnchoredOverlay
          anchorId="trigger"
          open={false}
          size={{ width: 8, height: 2 }}
          id="overlay"
        >
          <Text>menu</Text>
        </AnchoredOverlay>
      </Box>,
    )

    expect(app.text).not.toContain("menu")
    expect(findById(getRoot(app), "overlay")).toBeNull()
  })
})
