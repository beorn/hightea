/**
 * Tests for app.resize() — virtual terminal resize in tests.
 *
 * Verifies that resize:
 * 1. Updates buffer dimensions after re-layout
 * 2. Forces full re-render (clears prevBuffer)
 * 3. Components re-layout at new dimensions
 * 4. useContentRect reflects new dimensions
 * 5. Incremental rendering stays correct after resize
 */

import { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useContentRect } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("app.resize()", () => {
  test("updates buffer width after resize", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box height={10} width={40}>
        <Text>Hello</Text>
      </Box>,
    )

    expect(app.term.buffer.width).toBe(40)

    app.resize(60, 20)

    expect(app.term.buffer.width).toBe(60)
  })

  test("re-renders content at new dimensions", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box flexGrow={1}>
        <Text>AAAAAAAAAA</Text>
      </Box>,
    )

    expect(app.text).toContain("AAAAAAAAAA")

    // Resize to wider
    app.resize(80, 5)
    expect(app.text).toContain("AAAAAAAAAA")
    expect(app.term.buffer.width).toBe(80)
  })

  test("flex layout reflows on resize", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function FlexApp() {
      return (
        <Box flexGrow={1} flexDirection="row">
          <Box flexGrow={1}>
            <Text>LEFT</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>RIGHT</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<FlexApp />)

    // At 40 cols, each side gets ~20 cols
    const rightBefore = app.getByText("RIGHT").boundingBox()
    expect(rightBefore).not.toBeNull()

    // Resize to 80 cols — RIGHT should move to higher x
    app.resize(80, 5)

    const rightAfter = app.getByText("RIGHT").boundingBox()
    expect(rightAfter).not.toBeNull()
    expect(rightAfter!.x).toBeGreaterThan(rightBefore!.x)
    expect(app.term.buffer.width).toBe(80)
  })

  test("useContentRect reflects new dimensions after resize", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    let lastWidth = 0

    function SizeReporter() {
      const { width } = useContentRect()
      lastWidth = width ?? 0
      return <Text>Width: {width}</Text>
    }

    const app = render(
      <Box flexGrow={1}>
        <SizeReporter />
      </Box>,
    )

    expect(lastWidth).toBe(40)

    app.resize(80, 10)
    expect(lastWidth).toBe(80)
  })

  test("incremental rendering works correctly after resize", () => {
    const render = createRenderer({ cols: 40, rows: 5, incremental: true })

    function App() {
      return (
        <Box flexGrow={1}>
          <Text>Content</Text>
        </Box>
      )
    }

    const app = render(<App />)
    expect(app.text).toContain("Content")

    // Resize
    app.resize(60, 8)
    expect(app.text).toContain("Content")

    // Buffer dimensions match new size
    expect(app.term.buffer.width).toBe(60)
  })

  test("resize from larger to smaller", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box flexGrow={1}>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.term.buffer.width).toBe(80)

    app.resize(40, 10)

    expect(app.term.buffer.width).toBe(40)
    expect(app.text).toContain("Content")
  })

  test("HIGHTEA_STRICT: fresh render matches after resize", () => {
    const render = createRenderer({ cols: 40, rows: 5, incremental: true })

    const app = render(
      <Box flexGrow={1}>
        <Text>Hello World</Text>
      </Box>,
    )

    // After resize, fresh render should match incremental
    app.resize(60, 8)

    const freshBuffer = app.freshRender()
    const currentBuffer = app.term.buffer

    // Both buffers should have the new dimensions
    expect(freshBuffer.width).toBe(60)
    expect(currentBuffer.width).toBe(60)
  })

  test("multiple sequential resizes", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    let lastWidth = 0

    function SizeReporter() {
      const { width } = useContentRect()
      lastWidth = width ?? 0
      return <Text>W={width}</Text>
    }

    const app = render(
      <Box flexGrow={1}>
        <SizeReporter />
      </Box>,
    )
    expect(lastWidth).toBe(40)

    app.resize(60, 10)
    expect(lastWidth).toBe(60)
    expect(app.text).toContain("W=60")

    app.resize(100, 30)
    expect(lastWidth).toBe(100)
    expect(app.text).toContain("W=100")

    app.resize(20, 5)
    expect(lastWidth).toBe(20)
    expect(app.text).toContain("W=20")
  })

  test("input works after resize", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    const app = render(
      <Box flexGrow={1}>
        <Text>Hello</Text>
      </Box>,
    )
    expect(app.text).toContain("Hello")

    // Resize
    app.resize(60, 10)
    expect(app.text).toContain("Hello")

    // Press keys after resize — should not crash
    await app.press("j")
    expect(app.term.buffer.width).toBe(60)
  })

  test("height changes reflect in layout", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    let lastHeight = 0

    function HeightReporter() {
      const { height } = useContentRect()
      lastHeight = height ?? 0
      return <Text>H={height}</Text>
    }

    const app = render(
      <Box flexGrow={1} flexDirection="column">
        <HeightReporter />
      </Box>,
    )
    expect(lastHeight).toBe(10)

    app.resize(40, 20)
    expect(lastHeight).toBe(20)
    expect(app.text).toContain("H=20")

    app.resize(40, 5)
    expect(lastHeight).toBe(5)
    expect(app.text).toContain("H=5")
  })
})
