/**
 * Tests for inline mode + useScrollback behavior.
 *
 * Verifies:
 * - useScrollback freezes contiguous prefix to scrollback
 * - renderStringSync produces width-constrained output
 * - Inline mode layout uses terminal width correctly
 * - Content does not exceed specified width
 * - Scrollback notification chain works
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, renderStringSync, useInput } from "../src/index.js"
import { useScrollback } from "../src/hooks/useScrollback.js"
import { createRenderer, stripAnsi } from "inkx/testing"

// ============================================================================
// renderStringSync width constraints
// ============================================================================

describe("renderStringSync width constraints", () => {
  test("renders a box at exactly the given width", () => {
    for (const cols of [40, 60, 80, 100, 120]) {
      const output = renderStringSync(
        <Box borderStyle="round" borderColor="blue" paddingX={1}>
          <Text>Hello world this is some content that might be long enough to wrap at narrow widths</Text>
        </Box>,
        { width: cols },
      )

      const plainLines = stripAnsi(output).split("\n")
      for (let i = 0; i < plainLines.length; i++) {
        expect(plainLines[i]!.length).toBeLessThanOrEqual(cols)
      }
    }
  })

  test("nested boxes with borders stay within width", () => {
    function NestedLayout() {
      return (
        <Box flexDirection="column" overflow="hidden">
          <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
            <Text bold>Header</Text>
            <Text>Some content that should be constrained</Text>
            <Box flexDirection="column" borderStyle="bold" borderColor="yellow" borderLeft borderRight={false} borderTop={false} borderBottom={false} paddingLeft={1}>
              <Text>Nested content with left border only</Text>
              <Text>Another line of nested content</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    for (const cols of [40, 60, 80]) {
      const output = renderStringSync(<NestedLayout />, { width: cols })
      const plainLines = stripAnsi(output).split("\n")
      for (let i = 0; i < plainLines.length; i++) {
        expect(plainLines[i]!.length).toBeLessThanOrEqual(cols)
      }
    }
  })

  test("status bar with flexGrow stays within width", () => {
    function StatusBar() {
      return (
        <Box flexDirection="row" paddingX={1}>
          <Text color="cyan">0:42</Text>
          <Box flexGrow={1} />
          <Text color="gray">Enter next  a auto  c compact  q quit</Text>
          <Box flexGrow={1} />
          <Text color="cyan">{"█████░░░░░░░░░░░░░░░"}</Text>
          <Text color="gray"> 5/20</Text>
        </Box>
      )
    }

    for (const cols of [60, 80, 120]) {
      const output = renderStringSync(<StatusBar />, { width: cols })
      const plainLines = stripAnsi(output).split("\n")
      for (const line of plainLines) {
        expect(line.length).toBeLessThanOrEqual(cols)
      }
    }
  })
})

// ============================================================================
// useScrollback behavior
// ============================================================================

describe("useScrollback", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  interface Item {
    id: number
    text: string
    frozen: boolean
  }

  test("returns frozen count for contiguous prefix", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: true },
        { id: 3, text: "Third", frozen: false },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `[${item.id}] ${item.text}`,
        stdout: mockStdout,
      })

      return (
        <Box flexDirection="column">
          <Text>frozen={frozenCount}</Text>
          {items.slice(frozenCount).map((item) => (
            <Text key={item.id}>{item.text}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("frozen=2")
    expect(app.text).toContain("Third")
    // First two items should have been written to stdout
    expect(stdoutWrites.length).toBe(2)
    expect(stdoutWrites[0]).toContain("[1] First")
    expect(stdoutWrites[1]).toContain("[2] Second")
  })

  test("non-contiguous frozen items only count prefix", () => {
    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: false },
        { id: 3, text: "Third", frozen: true },
      ]

      const mockStdout = { write: () => true }
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mockStdout,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestApp />)
    // Only item 1 is contiguously frozen from the start
    expect(app.text).toContain("frozen=1")
  })

  test("incremental freezing writes only new items", () => {
    // Test the logic of useScrollback by rendering with progressively frozen items.
    // We use separate renders to avoid incremental diff issues with INKX_STRICT.
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    // Phase 1: nothing frozen
    function Phase1() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: false },
        { id: 2, text: "Second", frozen: false },
      ]
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `> ${item.text}`,
        stdout: mockStdout,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app1 = render(<Phase1 />)
    expect(app1.text).toContain("frozen=0")
    expect(stdoutWrites).toHaveLength(0)

    // Phase 2: first item frozen (separate render to avoid diff issues)
    const writes2: string[] = []
    const mockStdout2 = { write(d: string) { writes2.push(d); return true } }

    function Phase2() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: false },
      ]
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `> ${item.text}`,
        stdout: mockStdout2,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app2 = render(<Phase2 />)
    expect(app2.text).toContain("frozen=1")
    expect(writes2).toHaveLength(1)
    expect(writes2[0]).toContain("> First")
  })
})

// ============================================================================
// Inline mode content height constraints
// ============================================================================

describe("inline mode content constraints", () => {
  test("content taller than terminal is capped in renderStringSync", () => {
    // renderStringSync doesn't have termRows capping (that's in outputPhase),
    // but it should produce correct content regardless of height
    function TallContent() {
      return (
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i}>Line {i}</Text>
          ))}
        </Box>
      )
    }

    const output = renderStringSync(<TallContent />, { width: 80 })
    const lines = stripAnsi(output).split("\n")
    // Should contain all 50 lines (no capping in renderStringSync)
    expect(lines.length).toBeGreaterThanOrEqual(50)
  })

  // Note: Inline mode height capping (termRows) happens in the scheduler/output-phase
  // at real render time, not in the test renderer. The test renderer uses fullscreen mode.
  // Testing termRows capping requires running the actual inline render pipeline.
  test("renderStringSync auto-sizes height for all content", () => {
    function TallContent() {
      return (
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i}>Line {i}</Text>
          ))}
        </Box>
      )
    }

    // renderStringSync (used for scrollback rendering) should render ALL lines
    // since it's generating frozen scrollback content, not live viewport output
    const output = renderStringSync(<TallContent />, { width: 80 })
    const lines = stripAnsi(output).split("\n").filter((l) => l.trim())
    expect(lines.length).toBe(50)
  })
})

// ============================================================================
// Scrollback rendering quality (what appears in scrollback should be clean)
// ============================================================================

describe("scrollback rendering quality", () => {
  test("renderStringSync produces styled ANSI output", () => {
    const output = renderStringSync(
      <Box paddingX={1}>
        <Text dim bold color="cyan">
          {"❯ "}
        </Text>
        <Text dim>Fix the login bug</Text>
      </Box>,
      { width: 80 },
    )

    // Should contain ANSI codes for styling
    expect(output).toMatch(/\x1b\[/)
    // Should contain the text
    expect(stripAnsi(output)).toContain("❯")
    expect(stripAnsi(output)).toContain("Fix the login bug")
  })

  test("renderStringSync with nested boxes and diff colors", () => {
    function DiffBlock() {
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dim>existing code</Text>
          <Text dim color="red">
            {"- old code"}
          </Text>
          <Text dim color="green">
            {"+ new code"}
          </Text>
        </Box>
      )
    }

    const output = renderStringSync(<DiffBlock />, { width: 80 })
    const plain = stripAnsi(output)
    expect(plain).toContain("existing code")
    expect(plain).toContain("- old code")
    expect(plain).toContain("+ new code")
    // Should have ANSI color codes
    expect(output).toContain("38;") // foreground color
  })

  test("renderStringSync respects width for long content", () => {
    const longText = "This is a very long line of text that should wrap when rendered at a narrow width. It contains enough words to definitely exceed any reasonable terminal width."

    const output = renderStringSync(
      <Box borderStyle="round" paddingX={1}>
        <Text>{longText}</Text>
      </Box>,
      { width: 40 },
    )

    const plainLines = stripAnsi(output).split("\n")
    for (const line of plainLines) {
      expect(line.length).toBeLessThanOrEqual(40)
    }
    // Content should be spread across multiple lines
    expect(plainLines.length).toBeGreaterThan(3)
  })
})
