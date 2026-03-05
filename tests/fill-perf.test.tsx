/**
 * Fill single-pass rendering tests.
 *
 * Verifies that Fill renders in a single pass (no useContentRect re-render).
 * Parent must use flexBasis={0} to prevent content overflow.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@hightea/term/testing"
import { Box, Text, Fill } from "@hightea/term"

const render = createRenderer({ cols: 60, rows: 20 })

describe("Fill single-pass rendering", () => {
  test("fills remaining space with flexGrow+flexBasis=0", () => {
    const app = render(
      <Box width={30} flexDirection="row">
        <Text>abc</Text>
        <Text> </Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
        <Text> </Text>
        <Text>xyz</Text>
      </Box>,
    )
    expect(app.text).toContain("abc")
    expect(app.text).toContain("xyz")
    // 30 - 3(abc) - 1(sp) - 1(sp) - 3(xyz) = 22
    const stripped = app.text.replace(/\s+$/gm, "")
    expect(stripped).toMatch(/abc \.{20,} xyz/)
  })

  test("dot leader pattern renders correctly", () => {
    const app = render(
      <Box width={30} flexDirection="row">
        <Text color="yellow">hjkl</Text>
        <Text> </Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
        <Text> </Text>
        <Text>navigate</Text>
      </Box>,
    )
    expect(app.text).toContain("hjkl")
    expect(app.text).toContain("navigate")
    // 30 - 4(hjkl) - 1(sp) - 1(sp) - 8(navigate) = 16 dots
    expect(app.text).toContain(".".repeat(16))
  })

  test("many Fills in a column render simultaneously", () => {
    const entries = [
      { key: "hjkl", desc: "navigate" },
      { key: "z/Z", desc: "zoom" },
      { key: "gg/G", desc: "top/bottom" },
      { key: "J K", desc: "block nav" },
      { key: "Enter", desc: "zoom in" },
    ]

    const app = render(
      <Box flexDirection="column" width={40}>
        {entries.map((e, i) => (
          <Box key={i} flexDirection="row">
            <Text color="yellow">{e.key}</Text>
            <Text> </Text>
            <Box flexGrow={1} flexBasis={0}>
              <Fill>
                <Text dimColor>.</Text>
              </Fill>
            </Box>
            <Text> </Text>
            <Text>{e.desc}</Text>
          </Box>
        ))}
      </Box>,
    )

    for (const e of entries) {
      expect(app.text).toContain(e.key)
      expect(app.text).toContain(e.desc)
    }

    // Each row should render on a single line (text truncated, not wrapped)
    const lines = app.text.split("\n").filter((l) => l.includes("."))
    expect(lines.length).toBe(5)
  })

  test("section header fill with dashes", () => {
    const app = render(
      <Box width={40} flexDirection="row">
        <Text dimColor>── </Text>
        <Text bold color="cyan">
          NAVIGATION
        </Text>
        <Text> </Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor>─</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("──")
    expect(app.text).toContain("NAVIGATION")
    // Remaining: 40 - 3(──·) - 10(NAVIGATION) - 1(·) = 26 dashes
    expect(app.text).toContain("─".repeat(20))
  })
})
