/**
 * Click-granularity defaultPrevented gating.
 *
 * Stream D wired double-click → word selection and triple-click → line
 * selection at the runtime level. This file verifies that the auto-select
 * is gated on the component tree's defaultPrevented:
 *
 *   - dblclick on an interactive widget that calls `event.preventDefault()`
 *     in its onClick / onDblClick handler MUST NOT trigger word-selection.
 *   - tripleclick on a prevented widget MUST NOT trigger line-selection.
 *   - dblclick on a non-interactive widget (or one that does NOT prevent
 *     default) STILL triggers word-selection — existing behavior preserved.
 *
 * Observable signal: OSC 52 clipboard write. The auto-select copies the
 * selected text via OSC 52 just like a finished drag. When gated, no copy.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// Plain (non-interactive) content — control case: auto-select fires.
function PlainContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
    </Box>
  )
}

// Interactive content with onClick that calls preventDefault.
// Wraps a Text in a Box that consumes the click. Auto-select must NOT fire.
function PreventedClickWidget() {
  return (
    <Box flexDirection="column">
      <Box
        onClick={(e) => {
          e.preventDefault()
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
        }}
        onTripleClick={(e) => {
          e.preventDefault()
        }}
      >
        <Text>Hello World of Selection</Text>
      </Box>
      <Text>Second row here</Text>
    </Box>
  )
}

describe("click-granularity defaultPrevented gating", () => {
  test("dblclick on a widget that calls preventDefault does NOT auto-select the word", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<PreventedClickWidget />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Double-click on "World" — without the gate, this would copy "World".
    await term.mouse.dblclick(8, 0)
    await settle(200)

    // Gated: no clipboard write because click was prevented.
    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })

  test("tripleclick on a widget that calls preventDefault does NOT auto-select the line", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<PreventedClickWidget />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await settle(200)

    // Gated: no clipboard write because click was prevented.
    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })

  test("dblclick on plain content (no preventDefault) STILL auto-selects the word", async () => {
    // Existing behavior preserved — the gate only kicks in when prevented.
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<PlainContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    await term.mouse.dblclick(8, 0)
    await settle(200)

    expect(term.clipboard.last).toBe("World")

    handle.unmount()
  })

  test("tripleclick on plain content STILL auto-selects the line", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<PlainContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await settle(200)

    expect(term.clipboard.last).toBe("Hello World of Selection")

    handle.unmount()
  })
})
