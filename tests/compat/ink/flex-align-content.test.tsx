/**
 * Ink compat test: flex-align-content (from ink/test/flex-align-content.tsx)
 *
 * Note: These tests require flexWrap="wrap" which is a Flexily gap.
 * Only the space-evenly test is ported for now.
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import { Box, Text } from "../../../packages/compat/src/ink"
import { renderToString, initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

const renderWithAlignContent = (
  alignContent: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly" | "stretch",
): string =>
  renderToString(
    <Box width={2} height={6} flexWrap="wrap" alignContent={alignContent}>
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
      <Text>D</Text>
    </Box>,
  )

test("align content space-evenly", () => {
  const output = renderWithAlignContent("space-evenly")
  // Matches Ink upstream: floor rounding for measureFunc children
  // Free space 4 / 3 gaps = 1.333 → line0 at floor(1.333)=1, line1 at floor(3.667)=3
  expect(output).toBe("\nAB\n\nCD\n\n")
})
