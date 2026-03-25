/**
 * Tests for createAg() — era2a Phase 3.
 *
 * createAg is validated through 4636+ existing tests via executeRender
 * delegation. These tests verify the direct API + integration contract.
 */

import { describe, test, expect } from "vitest"
import { createAg } from "@silvery/ag-term/ag"
import { createRenderer } from "@silvery/test"
import React from "react"
import { Box, Text } from "silvery"

describe("createAg", () => {
  describe("executeRender delegation (integration)", () => {
    test("simple text renders correctly", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<Text>Hello World</Text>)
      expect(app.text).toContain("Hello World")
    })

    test("incremental rendering works through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<Text>Before</Text>)
      expect(app.text).toContain("Before")

      app.rerender(<Text>After</Text>)
      expect(app.text).toContain("After")
      expect(app.text).not.toContain("Before")
    })

    test("box layout works through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>,
      )
      expect(app.text).toContain("Line 1")
      expect(app.text).toContain("Line 2")
    })

    test("borders work through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box borderStyle="single">
          <Text>Bordered</Text>
        </Box>,
      )
      expect(app.text).toContain("┌")
      expect(app.text).toContain("Bordered")
    })
  })

  describe("API contract", () => {
    test("createAg is exported from @silvery/ag-term", () => {
      expect(typeof createAg).toBe("function")
    })

    test("ag has layout, render, and resetBuffer methods", () => {
      const mockRoot = {} as any
      const ag = createAg(mockRoot)
      expect(typeof ag.layout).toBe("function")
      expect(typeof ag.render).toBe("function")
      expect(typeof ag.resetBuffer).toBe("function")
      expect(ag.root).toBe(mockRoot)
    })
  })
})
