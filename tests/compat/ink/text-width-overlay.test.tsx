/**
 * Regression tests for Ink CJK overlay compat (km-silvery.ink-cjk-overlay).
 *
 * Adapted from /tmp/silvery-compat/ink/test/text-width.tsx — these are the
 * tests that exercise wide-char overlay style boundary clearing.
 *
 * Ink resolves overlay overlap by replacing the half-visible wide character
 * with a space (matching what real terminals do). Silvery's setCell now
 * matches this behavior at the buffer level.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { displayWidth } from "@silvery/ag-term/unicode"

describe("Ink compat: CJK overlay boundary clearing", () => {
  test("overlay on 1st cell of CJK character clears trailing placeholder", () => {
    // Absolute overlay at left=10 lands on the 1st cell of か (columns 10-11).
    // か's trailing placeholder at column 11 should be cleared to a space.
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={10}>
          <Text>X</Text>
        </Box>
      </Box>,
    )

    const line = app.lines[0]!
    expect(displayWidth(line)).toBe(20)
    expect(line).toBe("あいうえおX きくけこ")
  })

  test("overlay on 2nd cell of CJK character clears the full character", () => {
    // Absolute overlay at left=9 lands on the 2nd cell of お (columns 8-9).
    // お should be replaced by a space so the terminal doesn't render
    // a half-visible wide character.
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={9}>
          <Text>XYZ</Text>
        </Box>
      </Box>,
    )

    const line = app.lines[0]!
    expect(displayWidth(line)).toBe(20)
    expect(line).toBe("あいうえ XYZきくけこ")
  })

  test("CJK overlay on 2nd cell of CJK clears both sides", () => {
    // Absolute overlay at left=5 (2nd cell of う at columns 4-5).
    // 漢字テスト (10 cols) also ends at column 14, overwriting the 1st cell
    // of く (14-15), so く's trailing placeholder must be cleaned too.
    const render = createRenderer({ cols: 20, rows: 1 })
    const app = render(
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={5}>
          <Text>漢字テスト</Text>
        </Box>
      </Box>,
    )

    const line = app.lines[0]!
    expect(displayWidth(line)).toBe(20)
    expect(line).toBe("あい 漢字テスト けこ")
  })
})
