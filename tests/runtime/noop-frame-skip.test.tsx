import React, { useState } from "react"
import { describe, expect, test } from "vitest"

import { Text } from "../../src/index.js"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

function makeSink() {
  const writes: string[] = []
  return {
    writable: {
      write(data: string) {
        writes.push(data)
      },
    },
    clear() {
      writes.length = 0
    },
    get raw() {
      return writes.join("")
    },
    get count() {
      return writes.length
    },
  }
}

function NoOpInputApp() {
  const [label, setLabel] = useState("stable")
  useInput((input) => {
    if (input === "s") setLabel("stable")
  })
  return <Text>{label}</Text>
}

describe("runtime no-op frame skip", () => {
  test("does not emit terminal output for a keypress that leaves the frame unchanged", async () => {
    const sink = makeSink()
    const handle = await run(<NoOpInputApp />, {
      writable: sink.writable,
      cols: 24,
      rows: 3,
      mouse: false,
      focusReporting: false,
      textSizing: false,
      widthDetection: false,
    })
    await handle.waitForLayoutStable({ timeoutMs: 200 })
    await settle(80)

    sink.clear()
    await handle.press("s")
    await settle()

    expect(sink.raw).toBe("")
    expect(sink.count).toBe(0)

    handle.unmount()
  })
})
