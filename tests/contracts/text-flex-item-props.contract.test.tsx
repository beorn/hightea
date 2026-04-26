/**
 * TextFlexItemProps — flex item props on Text contract.
 *
 * Bead: km-silvery.text-intrinsic-vs-render (Phase 3)
 *
 * `<Text>` extends `TextFlexItemProps`, the subset of FlexboxProps that affect
 * how a leaf participates as a flex item: flexGrow, flexShrink, flexBasis,
 * alignSelf, minWidth, minHeight, maxWidth, maxHeight. This is the canonical
 * CSS escape hatch — instead of wrapping a Text in a Box to apply
 * `flexShrink={0}` or `minWidth={0}`, set them directly on the Text.
 *
 * The bug shape these contracts catch: a flex item prop "looks supported" on
 * Text (TS accepts it, IDE shows it in autocomplete) but the value never
 * reaches the layoutNode because the reconciler's `applyTextFlexItemProps` is
 * out of sync with the type. Without these tests, declared and applied props
 * drift silently and the escape hatch becomes a no-op.
 *
 * Each test uses a row container that creates flex pressure and asserts the
 * Text's resulting layout width — the observable consequence of the prop
 * actually being applied. See `applyTextFlexItemProps` in
 * `packages/ag-react/src/reconciler/nodes.ts` for the wire-through.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("contract: TextFlexItemProps reach the layoutNode (defaults)", () => {
  test("omitting flexShrink yields the CSS default of 1 — Text shrinks under pressure", () => {
    // Row of 20 cols total. Two Texts each with 11-char natural width.
    // Under CSS flex defaults (flexShrink=1) both shrink because 11 + 11 > 20.
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={20}>
        <Text id="a">Hello World</Text>
        <Text id="b">Hello World</Text>
      </Box>,
    )
    const a = app.locator("#a").boundingBox()!
    const b = app.locator("#b").boundingBox()!
    expect(a.width + b.width).toBeLessThanOrEqual(20)
    expect(a.width).toBeLessThan(11) // shrunk
  })
})

describe("contract: TextFlexItemProps — explicit values reach the layoutNode", () => {
  test("flexShrink={0} on Text keeps it rigid under flex pressure", () => {
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={20}>
        <Text id="rigid" flexShrink={0}>
          Hello World
        </Text>
        <Text id="flex">XXXXXXXXXXX</Text>
      </Box>,
    )
    const rigid = app.locator("#rigid").boundingBox()!
    // flexShrink=0 means the Text keeps its natural width even under pressure.
    expect(rigid.width).toBe(11)
  })

  test("flexGrow={1} on Text expands it into free row space", () => {
    const render = createRenderer({ cols: 30, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={30}>
        <Text id="grow" flexGrow={1}>
          A
        </Text>
        <Text id="rigid">B</Text>
      </Box>,
    )
    const grow = app.locator("#grow").boundingBox()!
    // Grown Text takes the remaining 29 cols (rigid sibling consumes 1).
    expect(grow.width).toBe(29)
  })

  test("flexBasis={20} on Text sets its initial main-size before grow/shrink", () => {
    const render = createRenderer({ cols: 30, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={30}>
        <Text id="basis" flexBasis={20} flexShrink={0} flexGrow={0}>
          AB
        </Text>
        <Text id="rest">CD</Text>
      </Box>,
    )
    const basis = app.locator("#basis").boundingBox()!
    expect(basis.width).toBe(20)
  })

  test("minWidth={0} on Text lets it collapse below intrinsic min-content", () => {
    // CSS §4.5 auto-min-size sets min-content as the implied flex floor.
    // Setting minWidth={0} on the Text overrides that floor and lets it
    // shrink to 0 (or whatever the parent allocates) — useful for
    // wrap='truncate' Text inside narrow containers without an explicit
    // overflow="hidden" parent.
    const render = createRenderer({ cols: 8, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={8}>
        <Text id="rigid" flexShrink={0}>
          AAAAAAAA
        </Text>
        <Text id="collapsible" wrap="truncate" minWidth={0}>
          Hello World
        </Text>
      </Box>,
    )
    const collapsible = app.locator("#collapsible").boundingBox()!
    // The rigid sibling consumed all 8 cols; the collapsible Text gets 0.
    expect(collapsible.width).toBe(0)
  })

  test("maxWidth={5} on Text caps its width even when content is wider", () => {
    const render = createRenderer({ cols: 30, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={30}>
        <Text id="capped" maxWidth={5} wrap="truncate">
          Hello World
        </Text>
      </Box>,
    )
    const capped = app.locator("#capped").boundingBox()!
    expect(capped.width).toBe(5)
  })

  test("alignSelf='center' on Text overrides the parent's alignItems", () => {
    // In a 5-row column, alignItems: 'flex-start' (CSS default) leaves the
    // Text at the left. alignSelf: 'center' moves it horizontally to center.
    const render = createRenderer({ cols: 10, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={10} height={5} alignItems="flex-start">
        <Text id="centered" alignSelf="center">
          mid
        </Text>
      </Box>,
    )
    // alignSelf affects the cross-axis (horizontal in a column). Center of a
    // 10-col container with a 3-char text means x=3 or 4 (rounded).
    const centered = app.locator("#centered").boundingBox()!
    expect(centered.x).toBeGreaterThanOrEqual(3)
    expect(centered.x).toBeLessThanOrEqual(4)
  })

  test("minHeight={3} on Text reserves vertical space even when content is shorter", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={20} height={5}>
        <Text id="tall" minHeight={3}>
          one line
        </Text>
        <Text id="rest">below</Text>
      </Box>,
    )
    const tall = app.locator("#tall").boundingBox()!
    expect(tall.height).toBeGreaterThanOrEqual(3)
  })

  test("maxHeight={1} on Text caps height to a single row even with multi-line content", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={20} height={5}>
        <Text id="capped" maxHeight={1}>
          {"line1\nline2\nline3"}
        </Text>
      </Box>,
    )
    const capped = app.locator("#capped").boundingBox()!
    expect(capped.height).toBe(1)
  })
})

describe("contract: TextFlexItemProps — removal restores defaults", () => {
  test("removing flexShrink={0} restores CSS default flexShrink=1 (Text shrinks again)", () => {
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={20}>
        <Text id="t" flexShrink={0}>
          Hello World
        </Text>
        <Text id="other">Hello World</Text>
      </Box>,
    )
    expect(app.locator("#t").boundingBox()!.width).toBe(11) // rigid

    app.rerender(
      <Box flexDirection="row" width={20}>
        <Text id="t">Hello World</Text>
        <Text id="other">Hello World</Text>
      </Box>,
    )
    // Default flexShrink=1 restored — both texts shrink equally.
    const t = app.locator("#t").boundingBox()!
    expect(t.width).toBeLessThan(11)
  })

  test("removing flexBasis restores 'auto' (intrinsic content sizing)", () => {
    const render = createRenderer({ cols: 30, rows: 1 })
    const app = render(
      <Box flexDirection="row" width={30}>
        <Text id="t" flexBasis={20} flexShrink={0} flexGrow={0}>
          AB
        </Text>
      </Box>,
    )
    expect(app.locator("#t").boundingBox()!.width).toBe(20)

    app.rerender(
      <Box flexDirection="row" width={30}>
        <Text id="t" flexShrink={0} flexGrow={0}>
          AB
        </Text>
      </Box>,
    )
    // flexBasis removed → defaults to auto → width matches natural content (2).
    expect(app.locator("#t").boundingBox()!.width).toBe(2)
  })
})
