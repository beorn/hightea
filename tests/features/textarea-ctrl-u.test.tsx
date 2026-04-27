/**
 * TextArea Ctrl+U behavior
 *
 * Ctrl+U kills from line-start to cursor on a logical line. When the cursor
 * is already at column 0 of a line below the first, Ctrl+U joins with the
 * previous line — same effect as Backspace at column 0. Without that
 * fallback, Ctrl+U at line-start was a confusing no-op.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "silvery"

function Probe({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <Box flexDirection="column" width={40}>
      <TextArea defaultValue={defaultValue} fieldSizing="fixed" rows={5} />
    </Box>
  )
}

describe("TextArea Ctrl+U", () => {
  test("kills to line-start when cursor is mid-line", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor lands at end of "line2" (row 1, col 5).
    const app = r(<Probe defaultValue={"line1\nline2"} />)

    await app.press("ctrl+u")

    // Row 1 cleared back to its start; row 0 untouched.
    expect(app.text).toContain("line1")
    expect(app.text).not.toContain("line2")
  })

  test("at line-start, joins with previous line (Backspace-equivalent)", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor at end of "line2" (row 1, col 5).
    const app = r(<Probe defaultValue={"line1\nline2"} />)

    // Move cursor to start of row 1.
    await app.press("Home")

    // Ctrl+U at column 0 should consume the preceding newline → one line "line1line2".
    await app.press("ctrl+u")

    expect(app.text).toContain("line1line2")
    // Cursor row should now be 0 (joined onto the first line).
    const cursor = app.getCursorState()
    expect(cursor!.y).toBe(0)
  })

  test("at start of buffer, no-op", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<Probe defaultValue={"line1\nline2"} />)

    // Walk all the way to offset 0.
    await app.press("Home")
    await app.press("ctrl+p")
    await app.press("Home")

    await app.press("ctrl+u")

    // Buffer unchanged.
    expect(app.text).toContain("line1")
    expect(app.text).toContain("line2")
  })
})
