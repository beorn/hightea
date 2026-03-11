/**
 * run() writable option — render into a custom sink.
 *
 * Verifies that run({ writable }) routes ANSI output to the writable
 * and that handle.press() drives interaction without real stdin/stdout.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "../../packages/term/src/runtime/run"

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

describe("run() writable option", () => {
  test("renders into termless terminal", async () => {
    const term = createTerminal({ backend: createXtermBackend(), cols: 40, rows: 10 })
    const handle = await run(<Counter />, {
      writable: { write: (s) => term.feed(s) },
      cols: 40,
      rows: 10,
    })

    expect(term.screen).toContainText("Counter")
    expect(term.screen).toContainText("Count: 0")
    // Box borders render through real terminal emulation
    expect(term.screen.getText()).toContain("╭")
    expect(term.screen.getText()).toContain("╰")

    handle.unmount()
    await term.close()
  })

  test("handle.press() triggers re-render into termless", async () => {
    const term = createTerminal({ backend: createXtermBackend(), cols: 40, rows: 10 })
    const handle = await run(<Counter />, {
      writable: { write: (s) => term.feed(s) },
      cols: 40,
      rows: 10,
    })

    expect(term.screen).toContainText("Count: 0")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 1")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 2")

    await handle.press("k")
    expect(term.screen).toContainText("Count: 1")

    handle.unmount()
    await term.close()
  })

  test("exit via useInput return", async () => {
    const term = createTerminal({ backend: createXtermBackend(), cols: 40, rows: 10 })
    const handle = await run(<Counter />, {
      writable: { write: (s) => term.feed(s) },
      cols: 40,
      rows: 10,
    })

    expect(term.screen).toContainText("Count: 0")
    await handle.press("Escape")
    // App should have exited cleanly
    await handle.waitUntilExit()

    await term.close()
  })
})
