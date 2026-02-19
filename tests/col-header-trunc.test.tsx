/**
 * Test: PUA (Private Use Area) character width in column headers
 *
 * Documents that PUA characters (Nerd Font icons like U+F114) are width 1
 * per string-width/Unicode spec. Terminals may render them wider, but inkx
 * cannot universally override this without breaking layout for content that
 * doesn't use Nerd Fonts.
 *
 * The column header truncation issue (km-tui.col-header-trunc) should be
 * handled at the application level, not in inkx's core width calculation.
 */
import { describe, expect, test } from "vitest"
import { Box, Text, displayWidth, graphemeWidth } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("PUA character width", () => {
  test("PUA characters are width 1 per Unicode spec", () => {
    // Nerd Font folder icon
    expect(graphemeWidth("\uF114")).toBe(1)
    // Nerd Font file icon
    expect(graphemeWidth("\uF0F6")).toBe(1)
    // Start of BMP PUA
    expect(graphemeWidth("\uE000")).toBe(1)
    // End of BMP PUA
    expect(graphemeWidth("\uF8FF")).toBe(1)
  })

  test("non-PUA characters are unaffected", () => {
    // Section sign - not PUA
    expect(graphemeWidth("\u00A7")).toBe(1)
    // Bullet - not PUA
    expect(graphemeWidth("\u2022")).toBe(1)
    // Regular ASCII
    expect(graphemeWidth("A")).toBe(1)
  })

  test("displayWidth with PUA icon — width 1 per spec", () => {
    const folderIcon = "\uF114"
    // icon(1) + space(1) + "FAMILY SCHEDULE"(15) = 17
    expect(displayWidth(`${folderIcon} FAMILY SCHEDULE`)).toBe(17)
    // bullet(1) + space(1) + 15 = 17
    expect(displayWidth("\u2022 FAMILY SCHEDULE")).toBe(17)
  })

  test("text with PUA icon in Box renders without crash", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    const folderIcon = "\uF114"
    const name = "FAMILY SCHEDULE"

    const app = render(
      <Box width={25}>
        <Text wrap="truncate">
          <Text>{folderIcon}</Text> <Text>{name}</Text>
        </Text>
      </Box>,
    )
    expect(app.text).toContain("FAMILY SCHEDULE")
  })

  test("flex layout with PUA icon", () => {
    const render = createRenderer({ cols: 80, rows: 3 })
    const folderIcon = "\uF114"

    const app = render(
      <Box flexDirection="row" width={30}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden" testID="text-box">
          <Text wrap="truncate" testID="text">
            <Text>{folderIcon}</Text> <Text>FAMILY SCHEDULE</Text>
          </Text>
        </Box>
        <Box flexShrink={0} testID="count">
          <Text>{" 1"}</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("FAMILY SCHEDULE")

    const textBox = app.getByTestId("text-box")
    const countBox = app.getByTestId("count")
    expect(textBox.boundingBox()!.width + countBox.boundingBox()!.width).toBe(30)
  })
})
