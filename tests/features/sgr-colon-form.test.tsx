import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { parseAnsiText, extractColonSGRReplacements } from "@silvery/ag-term"
import { createRenderer } from "@silvery/test"

const RGB = 0x1000000 | (255 << 16) | (100 << 8) | 0

describe("SGR truecolor colon form", () => {
  test("parseAnsiText treats semicolon and colon truecolor foreground forms equivalently", () => {
    expect(parseAnsiText("\x1b[38;2;255;100;0mfg")[0]).toMatchObject({ text: "fg", fg: RGB })
    expect(parseAnsiText("\x1b[38:2::255:100:0mfg")[0]).toMatchObject({ text: "fg", fg: RGB })
    expect(parseAnsiText("\x1b[38:2:255:100:0mfg")[0]).toMatchObject({ text: "fg", fg: RGB })
  })

  test("parseAnsiText treats semicolon and colon truecolor background forms equivalently", () => {
    expect(parseAnsiText("\x1b[48;2;255;100;0mbg")[0]).toMatchObject({ text: "bg", bg: RGB })
    expect(parseAnsiText("\x1b[48:2::255:100:0mbg")[0]).toMatchObject({ text: "bg", bg: RGB })
    expect(parseAnsiText("\x1b[48:2:255:100:0mbg")[0]).toMatchObject({ text: "bg", bg: RGB })
  })

  test("colon replacement tracker maps both truecolor colon variants to canonical semicolon SGR", () => {
    expect(extractColonSGRReplacements("\x1b[38:2::255:100:0m")).toEqual([
      {
        semicolonForm: "\x1b[38;2;255;100;0m",
        colonForm: "\x1b[38:2::255:100:0m",
      },
    ])
    expect(extractColonSGRReplacements("\x1b[38:2:255:100:0m")).toEqual([
      {
        semicolonForm: "\x1b[38;2;255;100;0m",
        colonForm: "\x1b[38:2:255:100:0m",
      },
    ])
  })

  test("rendering compact colon-form truecolor input emits equivalent semicolon output", () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <Box>
        <Text>{"\x1b[38:2:255:100:0mOrange\x1b[0m"}</Text>
      </Box>,
    )

    expect(app.text).toContain("Orange")
    expect(app.ansi).toMatch(/38;2;255;100;0m/)
  })
})
