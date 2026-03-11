/**
 * App exit key handling via createTermless() + run().
 *
 * Tests that lifecycle keys (Ctrl+C, Ctrl+D, Escape) properly exit the app
 * when routed through the full runtime pipeline — including headless mode
 * where press() handles input directly.
 *
 * Bug: exitOnCtrlC checked raw byte ("\x03") but parseKey returns input="c"
 * with key.ctrl=true. press() also lacked lifecycle key interception entirely.
 */

import React, { useRef, useState } from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "../../packages/term/src/runtime/run"

// ============================================================================
// Test Component
// ============================================================================

/**
 * Mimics the ai-chat example exit pattern:
 * - Escape → immediate exit
 * - Ctrl+D twice within 500ms → exit
 * - Other keys → display status
 */
function ExitApp() {
  const [status, setStatus] = useState("running")
  const lastCtrlDRef = useRef(0)

  useInput((input: string, key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      setStatus("ctrl-d-once")
      return
    }
  })

  return (
    <Box>
      <Text>Status: {status}</Text>
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("app exit keys via termless", () => {
  test("Ctrl+C exits the app", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ExitApp />, term)

    expect(term.screen).toContainText("Status: running")

    await handle.press("ctrl+c")
    await handle.waitUntilExit()
  })

  test("Ctrl+D twice quickly exits the app", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ExitApp />, term)

    expect(term.screen).toContainText("Status: running")

    // First Ctrl+D — sets timestamp, does not exit
    await handle.press("ctrl+d")
    expect(term.screen).toContainText("Status: ctrl-d-once")

    // Second Ctrl+D within 500ms — exits
    await handle.press("ctrl+d")
    await handle.waitUntilExit()
  })

  test("Escape exits the app", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ExitApp />, term)

    expect(term.screen).toContainText("Status: running")

    await handle.press("Escape")
    await handle.waitUntilExit()
  })
})
