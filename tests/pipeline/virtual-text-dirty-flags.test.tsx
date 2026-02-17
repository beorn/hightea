/**
 * Test: Virtual text children dirty flag clearing during incremental rendering.
 *
 * Regression for km-tui.edit-display: text typed during inline editing doesn't
 * display because incremental rendering misses the update.
 *
 * Root cause: Virtual text children (inkx-text nodes without layoutNode) get
 * dirty flags on creation but these flags are NEVER cleared by the content
 * phase. renderNodeToBuffer returns early for no-layout nodes (line 199) and
 * clearDirtyFlags only recurses into children with layoutNode.
 *
 * As a result, markSubtreeDirty() (which stops at nodes already subtreeDirty)
 * never propagates future updates past the stale dirty virtual text node to
 * layout ancestors. The content phase skips the layout ancestor entirely,
 * producing a 0-byte diff.
 */

import React, { useRef, useState } from "react"
import { describe, expect, it, afterEach, beforeEach } from "vitest"
import { Box, Text } from "../../src/index.js"
import { createApp, useApp } from "../../src/runtime/index.js"

// Enable incremental comparison check
beforeEach(() => {
  process.env.INKX_CHECK_INCREMENTAL = "1"
})
afterEach(() => {
  delete process.env.INKX_CHECK_INCREMENTAL
})

describe("virtual text dirty flag clearing", () => {
  /**
   * Tests store-driven nested Text updates (case 3: standalone render).
   */
  it("updates nested Text content via store update", async () => {
    interface AppStore {
      label: string
      setLabel: (s: string) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        label: "initial",
        setLabel: (s: string) => set({ label: s }),
      }),
      {
        key: (input) => {
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const label = useApp((s: AppStore) => s.label)
      return (
        <Box flexDirection="column" width={40} height={10}>
          <Text>
            Header: <Text bold>{label}</Text>
          </Text>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 40, rows: 10 })
    expect(handle.text).toContain("initial")

    handle.store.getState().setLabel("updated")
    await new Promise((r) => setTimeout(r, 50))
    expect(handle.text).toContain("updated")

    handle.store.getState().setLabel("final")
    await new Promise((r) => setTimeout(r, 50))
    expect(handle.text).toContain("final")

    handle.unmount()
  })

  /**
   * Tests press()-driven nested Text updates (processEventBatch path).
   *
   * This mimics the real km-tui InlineEditField: a key handler updates
   * React state (useState) inside a component, which triggers re-render
   * with updated nested Text content. The key handler runs during
   * processEventBatch with isRendering=true, inEventHandler=true.
   */
  it("updates nested Text content via press() with React state", async () => {
    // Use a ref to expose the React-internal state setter
    let appendChar: (char: string) => void = () => {}

    interface AppStore {
      _dummy: number
    }

    const app = createApp<AppStore>(
      () => () => ({ _dummy: 0 }),
      {
        key: (input) => {
          if (input === "q") return "exit"
          // Trigger React state update from key handler (like insertChar)
          appendChar(input)
        },
      },
    )

    function App() {
      const [text, setText] = useState("hello")
      const [, forceRender] = useState(0)

      // Expose the setter - mimics blockEditTargetRef pattern
      appendChar = (char: string) => {
        setText((prev) => prev + char)
        forceRender((v) => v + 1)
      }

      return (
        <Box flexDirection="column" width={40} height={10}>
          <Text>
            {text}
            <Text inverse>|</Text>
          </Text>
          <Box flexGrow={1}>
            <Text>Footer content</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 40, rows: 10 })
    expect(handle.text).toContain("hello")

    // Type 'x' - goes through press() → key handler → setState → doRender
    await handle.press("x")
    expect(handle.text).toContain("hellox")

    // Type 'y' - second update must also work
    await handle.press("y")
    expect(handle.text).toContain("helloxy")

    // Type 'z'
    await handle.press("z")
    expect(handle.text).toContain("helloxyz")

    handle.unmount()
  })

  /**
   * Deeply nested text structure matching InlineEditField:
   * Text > {beforeCursor} + Text(inverse){cursor} + {afterCursor}
   *
   * Uses press() to trigger updates through the full event pipeline.
   */
  it("handles InlineEditField-like structure via press()", async () => {
    let insertChar: (char: string) => void = () => {}

    interface AppStore {
      _dummy: number
    }

    const app = createApp<AppStore>(
      () => () => ({ _dummy: 0 }),
      {
        key: (input) => {
          if (input === "q") return "exit"
          insertChar(input)
        },
      },
    )

    function EditField() {
      const [before, setBefore] = useState("See instructions.")
      const [, setVersion] = useState(0)

      insertChar = (char: string) => {
        setBefore((prev) => prev + char)
        setVersion((v) => v + 1)
      }

      const cursorChar = " "
      return (
        <Text>
          {before}
          <Text inverse>{cursorChar}</Text>
        </Text>
      )
    }

    function App() {
      return (
        <Box flexDirection="column" width={60} height={10}>
          <Box>
            <Text>Header</Text>
          </Box>
          <Box>
            <EditField />
          </Box>
          <Box flexGrow={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 10 })
    expect(handle.text).toContain("See instructions.")

    // Type characters - this triggers the full pipeline:
    // press → key handler → insertChar → setBefore → setVersion →
    // doRender → updateContainerSync → commitTextUpdate →
    // markLayoutAncestorDirty + markSubtreeDirty → executeRender
    await handle.press("x")
    expect(handle.text).toContain("See instructions.x")

    await handle.press("y")
    expect(handle.text).toContain("See instructions.xy")

    await handle.press("z")
    expect(handle.text).toContain("See instructions.xyz")

    handle.unmount()
  })
})
