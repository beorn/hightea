/**
 * Tests for Table component
 */

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { Table } from "../src/display/Table.js"
import type { TableColumn } from "../src/types.js"

// Helper to render table and get output string
function renderTable(columns: TableColumn[], data: Array<Record<string, unknown>>, border = false): string {
  const element = Table({ columns, data, border })
  return element.props.children as string
}

describe("Table", () => {
  const basicColumns: TableColumn[] = [
    { key: "name", header: "Name" },
    { key: "value", header: "Value" },
  ]

  const basicData = [
    { name: "Item 1", value: "100" },
    { name: "Item 2", value: "200" },
  ]

  describe("createElement", () => {
    it("creates element with required props", () => {
      const element = createElement(Table, {
        columns: basicColumns,
        data: basicData,
      })

      expect(element.type).toBe(Table)
      expect(element.props.columns).toBe(basicColumns)
      expect(element.props.data).toBe(basicData)
    })

    it("accepts border prop", () => {
      const element = createElement(Table, {
        columns: basicColumns,
        data: basicData,
        border: true,
      })

      expect(element.props.border).toBe(true)
    })

    it("accepts columns with width and align", () => {
      const columns: TableColumn[] = [
        { key: "id", header: "ID", width: 5, align: "right" },
        { key: "name", header: "Name", width: 20, align: "left" },
        { key: "status", header: "Status", width: 10, align: "center" },
      ]

      const element = createElement(Table, {
        columns,
        data: [],
      })

      expect(element.props.columns[0]?.width).toBe(5)
      expect(element.props.columns[0]?.align).toBe("right")
      expect(element.props.columns[1]?.align).toBe("left")
      expect(element.props.columns[2]?.align).toBe("center")
    })

    it("handles empty data array", () => {
      const element = createElement(Table, {
        columns: basicColumns,
        data: [],
      })

      expect(element.props.data).toHaveLength(0)
    })
  })

  describe("rendering", () => {
    it("renders without borders by default", () => {
      const output = renderTable(basicColumns, basicData)
      const lines = output.split("\n")

      // Should have header + 2 data rows = 3 lines
      expect(lines).toHaveLength(3)
      // Should not contain box drawing characters
      expect(output).not.toContain("│")
      expect(output).not.toContain("─")
    })

    it("renders with borders when enabled", () => {
      const output = renderTable(basicColumns, basicData, true)
      const lines = output.split("\n")

      // Should have: top border + header + separator + 2 data rows + bottom border = 6 lines
      expect(lines).toHaveLength(6)
      // Should contain box drawing characters
      expect(output).toContain("│")
      expect(output).toContain("─")
      expect(output).toContain("┌")
      expect(output).toContain("┐")
      expect(output).toContain("└")
      expect(output).toContain("┘")
    })

    it("aligns text correctly", () => {
      const columns: TableColumn[] = [
        { key: "left", header: "Left", width: 10, align: "left" },
        { key: "center", header: "Center", width: 10, align: "center" },
        { key: "right", header: "Right", width: 10, align: "right" },
      ]
      const data = [{ left: "L", center: "C", right: "R" }]

      const output = renderTable(columns, data)
      const lines = output.split("\n")
      const dataRow = lines[1]

      // Check left alignment (value at start, padding at end)
      expect(dataRow).toContain("L         ")
      // Check right alignment (padding at start, value at end)
      expect(dataRow).toContain("         R")
    })

    it("truncates long values with ellipsis", () => {
      const columns: TableColumn[] = [{ key: "text", header: "Text", width: 5 }]
      const data = [{ text: "Hello World" }]

      const output = renderTable(columns, data)

      // "Hello World" (11 chars) should be truncated to "Hell…" (5 chars)
      expect(output).toContain("Hell…")
      expect(output).not.toContain("Hello World")
    })

    it("auto-calculates column width from content", () => {
      const columns: TableColumn[] = [{ key: "text", header: "A" }]
      const data = [{ text: "Hello" }, { text: "Hi" }]

      const output = renderTable(columns, data)
      const lines = output.split("\n")

      // Width should be 5 (from "Hello"), so "A" should be padded and "Hi" should be padded
      const headerLine = lines[0]
      const helloLine = lines[1]
      const hiLine = lines[2]

      // Header "A" padded to 5 chars
      expect(headerLine?.length).toBe(5)
      // Data values padded to 5 chars each
      expect(helloLine?.length).toBe(5)
      expect(hiLine?.length).toBe(5)
    })

    it("handles missing data values gracefully", () => {
      const columns: TableColumn[] = [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
      ]
      const data = [{ a: "value" }] // missing 'b'

      const output = renderTable(columns, data)

      // Should not throw and should render empty string for missing value
      expect(output).toContain("value")
    })

    it("renders header row correctly", () => {
      const columns: TableColumn[] = [
        { key: "col1", header: "Column 1" },
        { key: "col2", header: "Column 2" },
      ]

      const output = renderTable(columns, [])
      const lines = output.split("\n")

      expect(lines[0]).toContain("Column 1")
      expect(lines[0]).toContain("Column 2")
    })
  })

  describe("border styles", () => {
    it("uses correct Unicode box drawing characters for borders", () => {
      const columns: TableColumn[] = [{ key: "x", header: "X", width: 3 }]
      const data = [{ x: "1" }]

      const output = renderTable(columns, data, true)

      // Top border
      expect(output).toContain("┌")
      expect(output).toContain("┐")
      // Middle separator
      expect(output).toContain("├")
      expect(output).toContain("┤")
      // Bottom border
      expect(output).toContain("└")
      expect(output).toContain("┘")
      // Horizontal and vertical lines
      expect(output).toContain("─")
      expect(output).toContain("│")
    })

    it("uses cross character for multi-column borders", () => {
      const columns: TableColumn[] = [
        { key: "a", header: "A", width: 3 },
        { key: "b", header: "B", width: 3 },
      ]
      const data = [{ a: "1", b: "2" }]

      const output = renderTable(columns, data, true)

      // Should have T-junctions and crosses
      expect(output).toContain("┬") // Top T-junction
      expect(output).toContain("┼") // Cross
      expect(output).toContain("┴") // Bottom T-junction
    })
  })
})
