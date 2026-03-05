/**
 * Tests for singlePassLayout option in the test renderer.
 *
 * Validates that singlePassLayout=true makes the test renderer match
 * production's create-app.tsx behavior: single executeRender per doRender(),
 * with a separate effect flush loop for layout feedback.
 */
import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@hightea/term/testing"
import { Box, Text, useInput } from "@hightea/term"
import { useContentRect } from "@hightea/term"

describe("singlePassLayout", () => {
  test("renders correctly with default (no singlePassLayout)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box>
        <Text>Hello</Text>
      </Box>,
    )
    expect(app.text).toContain("Hello")
  })

  test("renders correctly with singlePassLayout=true", () => {
    const render = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
    const app = render(
      <Box>
        <Text>Hello</Text>
      </Box>,
    )
    expect(app.text).toContain("Hello")
  })

  test("per-render override works", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box>
        <Text>Hello</Text>
      </Box>,
      { singlePassLayout: true },
    )
    expect(app.text).toContain("Hello")
  })

  test("useContentRect stabilizes in multi-pass mode", () => {
    // useContentRect must be called inside a Box (which provides NodeContext)
    function SizeAwareInner() {
      const { width } = useContentRect()
      return <Text>Width: {width ?? "?"}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column" width="100%">
        <SizeAwareInner />
      </Box>,
    )
    expect(app.text).toContain("Width: 40")
  })

  test("useContentRect stabilizes in single-pass mode (initial render)", () => {
    // NOTE: singlePassLayout only affects subsequent renders (sendInput/press).
    // The initial render always uses multi-pass stabilization.
    function SizeAwareInner() {
      const { width } = useContentRect()
      return <Text>Width: {width ?? "?"}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
    const app = render(
      <Box flexDirection="column" width="100%">
        <SizeAwareInner />
      </Box>,
    )
    expect(app.text).toContain("Width: 40")
  })

  test("interactive component works in single-pass mode", async () => {
    function Interactive() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((c) => c + 1)
      })
      return <Text>Count: {count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
    const app = render(<Interactive />)
    expect(app.text).toContain("Count: 0")

    await app.press("j")
    expect(app.text).toContain("Count: 1")

    await app.press("j")
    expect(app.text).toContain("Count: 2")
  })

  test("useContentRect updates correctly after press in single-pass mode", async () => {
    // Tests that the sendInput flush loop (which matches production's
    // processEventBatch) correctly handles layout feedback after key presses
    function SizeAwareCounter() {
      const { width } = useContentRect()
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((c) => c + 1)
      })
      return (
        <Text>
          W:{width ?? "?"} C:{count}
        </Text>
      )
    }

    const render = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
    const app = render(
      <Box flexDirection="column" width="100%">
        <SizeAwareCounter />
      </Box>,
    )
    expect(app.text).toContain("W:40")
    expect(app.text).toContain("C:0")

    await app.press("j")
    expect(app.text).toContain("W:40")
    expect(app.text).toContain("C:1")

    await app.press("j")
    expect(app.text).toContain("W:40")
    expect(app.text).toContain("C:2")
  })

  test("single-pass produces same result as multi-pass for simple layout", () => {
    function Layout() {
      return (
        <Box flexDirection="row" width="100%">
          <Box width="50%">
            <Text>Left</Text>
          </Box>
          <Box width="50%">
            <Text>Right</Text>
          </Box>
        </Box>
      )
    }

    const renderMulti = createRenderer({ cols: 80, rows: 10 })
    const appMulti = renderMulti(<Layout />)

    const renderSingle = createRenderer({ cols: 80, rows: 10, singlePassLayout: true })
    const appSingle = renderSingle(<Layout />)

    expect(appSingle.text).toBe(appMulti.text)
  })
})
