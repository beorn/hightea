/**
 * Shift+Enter must create a newline AND render it visually.
 *
 * The companion test `textarea-shift-enter.test.tsx` checks behaviour
 * (no submit, both halves of the value present in `app.text`). It does
 * NOT verify the rendered placement on screen — `app.text` joins lines
 * with newlines, so a buggy implementation that put both halves on row
 * 0 would still satisfy `.toContain("hi")` + `.toContain("yo")`.
 *
 * This file adds the visual-placement check: "hi" on row 0, "yo" on
 * row 1, with a literal `\n` between them in the rendered text.
 *
 * Companion bead: km-silvery.shift-enter-visual-test.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "@silvery/ag-react"

describe("TextArea Shift+Enter — visual newline", () => {
  test("hi[Shift+Enter]yo renders as two separate lines", async () => {
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={20} height={5}>
          <TextArea
            value={value}
            onChange={setValue}
            submitKey="enter"
            onSubmit={() => {}}
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 20, rows: 5, kittyMode: true })
    const app = r(<App />)
    await app.type("hi")
    await app.press("Shift+Enter")
    await app.type("yo")

    const lines = app.lines.map((l) => l.trimEnd()).filter((l) => l.length > 0)
    expect(lines[0]).toContain("hi")
    expect(lines[1]).toContain("yo")
    // Critical: the two halves must NOT collapse onto the same row.
    expect(lines[0]).not.toContain("yo")
    expect(lines[1]).not.toContain("hi")
    // The underlying frame text should contain a literal newline between halves.
    expect(app.text).toMatch(/hi[\s\S]*\n[\s\S]*yo/)
  })

  test("Shift+Enter without submitKey also creates a newline", async () => {
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={20} height={5}>
          <TextArea value={value} onChange={setValue} fieldSizing="fixed" rows={4} />
        </Box>
      )
    }
    const r = createRenderer({ cols: 20, rows: 5, kittyMode: true })
    const app = r(<App />)
    await app.type("a")
    await app.press("Shift+Enter")
    await app.type("b")
    const lines = app.lines.map((l) => l.trimEnd()).filter((l) => l.length > 0)
    expect(lines[0]).toContain("a")
    expect(lines[1]).toContain("b")
    expect(lines[0]).not.toContain("b")
    expect(lines[1]).not.toContain("a")
  })
})
