import type { Cell, TerminalBuffer } from "@silvery/ag-term/buffer"

export interface TestCellSnapshot extends Cell {
  readonly x: number
  readonly y: number
  readonly selectable: boolean
}

export function readCellSnapshot(buffer: TerminalBuffer, x: number, y: number): TestCellSnapshot {
  return {
    x,
    y,
    ...buffer.getCell(x, y),
    selectable: buffer.isCellSelectable(x, y),
  }
}

export function readCellRow(buffer: TerminalBuffer, y: number): TestCellSnapshot[] {
  const cells: TestCellSnapshot[] = []
  for (let x = 0; x < buffer.width; x++) cells.push(readCellSnapshot(buffer, x, y))
  return cells
}

export function formatSelectableCells(buffer: TerminalBuffer): string {
  const lines: string[] = []
  for (let y = 0; y < buffer.height; y++) {
    const chars = readCellRow(buffer, y)
      .map((cell) => {
        if (cell.char === "") return cell.selectable ? "^" : ","
        if (cell.char === " ") return cell.selectable ? "_" : "."
        return cell.selectable ? cell.char : cell.char.toLowerCase()
      })
      .join("")
    lines.push(chars)
  }
  return lines.join("\n")
}
