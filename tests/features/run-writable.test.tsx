/**
 * run() with terminal emulator — render into a termless backend via createTerm().
 *
 * Verifies that createTerm(backend, dims) creates a Term that routes ANSI output
 * to a real terminal emulator, and that handle.press() drives interaction.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createXtermBackend } from "@termless/xtermjs"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "../../packages/term/src/runtime/run"
import { createTerm } from "../../packages/term/src/ansi/term"

// ============================================================================
// Test Component
// ============================================================================

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Counter</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("run() with createTerm(backend, dims)", () => {
  test("renders into termless terminal", async () => {
    using term = createTerm(createXtermBackend(), { cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Counter")
    expect(term.screen).toContainText("Count: 0")
    // Box borders render through real terminal emulation
    expect(term.screen!.getText()).toContain("╭")
    expect(term.screen!.getText()).toContain("╰")

    handle.unmount()
  })

  test("handle.press() triggers re-render into termless", async () => {
    using term = createTerm(createXtermBackend(), { cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Count: 0")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 1")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 2")

    await handle.press("k")
    expect(term.screen).toContainText("Count: 1")

    handle.unmount()
  })

  test("exit via useInput return", async () => {
    using term = createTerm(createXtermBackend(), { cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Count: 0")
    await handle.press("Escape")
    // App should have exited cleanly
    await handle.waitUntilExit()
  })
})
