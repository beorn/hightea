/**
 * Minimal reproduction of incremental rendering mismatch in single-pass mode.
 *
 * Tests that when a text component updates, the incremental render
 * matches a fresh render (no stale content in the buffer).
 */
import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, bufferToText } from "@hightea/term/testing"
import { compareBuffers, formatMismatch } from "@hightea/term/toolbelt"
import { Box, Text, useInput } from "@hightea/term"

describe("single-pass incremental correctness", () => {
  test("text update: incremental matches fresh after rerender", async () => {
    function App() {
      const [label, setLabel] = useState("aaa")
      useInput((input) => {
        if (input === "x") setLabel("ccc")
      })
      return (
        <Box width={20}>
          <Text>Label: {label}</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5, singlePassLayout: true })
    const app = render(<App />)
    expect(app.text).toContain("Label: aaa")

    await app.press("x")
    expect(app.text).toContain("Label: ccc")

    // Compare incremental buffer against fresh render
    const incBuf = app.lastBuffer()
    const freshBuf = app.freshRender()
    const mismatch = compareBuffers(incBuf!, freshBuf)
    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "x",
        incrementalText: bufferToText(incBuf!),
        freshText: bufferToText(freshBuf),
      })
      throw new Error(`Incremental rendering mismatch:\n${msg}`)
    }
  })

  test("double-processing: handleKey + sendInput pattern", async () => {
    // Simulates the testEnv press pattern:
    // 1. act() with direct state update
    // 2. press(key) which triggers sendInput → doRender
    let setPageFn: ((p: number) => void) | null = null

    function App() {
      const [page, setPage] = useState(0)
      setPageFn = (p: number) => setPage(p)
      useInput((input) => {
        // useInput handler does nothing (handleKey already processed)
      })
      const labels = ["aaa", "bbb", "ccc"]
      return (
        <Box width={20}>
          <Text>Label: {labels[page]}</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5, singlePassLayout: true })
    const app = render(<App />)
    expect(app.text).toContain("Label: aaa")

    // Simulate testEnv pattern: direct state update + press
    const { act } = await import("react")
    act(() => {
      setPageFn!(1)
    })
    await app.press("x") // triggers sendInput → doRender

    expect(app.text).toContain("Label: bbb")

    // Check incremental buffer
    const incBuf = app.lastBuffer()
    const freshBuf = app.freshRender()
    const mismatch = compareBuffers(incBuf!, freshBuf)
    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "x",
        incrementalText: bufferToText(incBuf!),
        freshText: bufferToText(freshBuf),
      })
      throw new Error(`Incremental rendering mismatch:\n${msg}`)
    }
  })

  test("breadcrumb-like: text changes on navigation", async () => {
    function App() {
      const [page, setPage] = useState(0)
      const labels = ["board / col1 / 1a", "board / col2 / 2a", "board / col3 / 3c"]
      useInput((input) => {
        if (input === "l") setPage((p) => Math.min(p + 1, 2))
      })
      return (
        <Box flexDirection="column" width={40}>
          <Box backgroundColor="white" width={40}>
            <Text color="gray" wrap="truncate">
              {labels[page]}
            </Text>
          </Box>
          <Text>Content for page {page}</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5, singlePassLayout: true })
    const app = render(<App />)
    expect(app.text).toContain("board / col1 / 1a")

    // First navigation
    await app.press("l")
    expect(app.text).toContain("board / col2 / 2a")

    // Check incremental buffer
    let incBuf = app.lastBuffer()
    let freshBuf = app.freshRender()
    let mismatch = compareBuffers(incBuf!, freshBuf)
    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "l (first)",
        incrementalText: bufferToText(incBuf!),
        freshText: bufferToText(freshBuf),
      })
      throw new Error(`Incremental rendering mismatch after first 'l':\n${msg}`)
    }

    // Second navigation
    await app.press("l")
    expect(app.text).toContain("board / col3 / 3c")

    // Check incremental buffer again
    incBuf = app.lastBuffer()
    freshBuf = app.freshRender()
    mismatch = compareBuffers(incBuf!, freshBuf)
    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "l (second)",
        incrementalText: bufferToText(incBuf!),
        freshText: bufferToText(freshBuf),
      })
      throw new Error(`Incremental rendering mismatch after second 'l':\n${msg}`)
    }
  })
})
