/**
 * Buffer region capture — extract a rectangular region from a TerminalBuffer
 * as ANSI-styled rows and plain text rows.
 *
 * Used by ListView cache to snapshot the real rendered output of items
 * (borders, padding, colors) instead of just plain text.
 */

import {
  type Style,
  type TerminalBuffer,
  createMutableCell,
  hasActiveAttrs,
  styleEquals,
  styleTransitionCodes,
  styleResetCodes,
  trimTrailingWhitespacePreservingAnsi,
} from "./buffer"

export interface CapturedRegion {
  /** ANSI-styled rows (one string per row, no cursor movement) */
  rows: string[]
  /** Plain text rows (ANSI stripped) */
  plainTextRows: string[]
}

/**
 * Capture a rectangular region from a TerminalBuffer as ANSI rows.
 *
 * Reads cells row by row from (x, y) to (x+width-1, y+height-1),
 * converting each row to an ANSI string with style transitions.
 * Reuses the same style serialization as bufferToStyledText.
 *
 * @param buffer - The terminal buffer to read from
 * @param x - Left column (0-indexed)
 * @param y - Top row (0-indexed)
 * @param width - Number of columns
 * @param height - Number of rows
 * @returns ANSI rows and plain text rows
 */
export function captureRegion(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
): CapturedRegion {
  const rows: string[] = []
  const plainTextRows: string[] = []

  // Reusable cell to avoid per-cell allocation
  const cell = createMutableCell()

  for (let row = y; row < y + height; row++) {
    let ansiLine = ""
    let plainLine = ""
    let currentStyle: Style | null = null
    let currentHyperlink: string | undefined

    for (let col = x; col < x + width; col++) {
      buffer.readCellInto(col, row, cell)

      // Skip continuation cells (part of wide character)
      if (cell.continuation) continue

      // Handle OSC 8 hyperlink transitions
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          ansiLine += "\x1b]8;;\x1b\\" // Close previous hyperlink
        }
        if (cellHyperlink) {
          ansiLine += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
        }
        currentHyperlink = cellHyperlink
      }

      // Build style and emit transition if changed
      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: { ...cell.attrs },
      }
      if (!styleEquals(currentStyle, cellStyle)) {
        ansiLine += styleTransitionCodes(currentStyle, cellStyle)
        currentStyle = cellStyle
      }

      const char = cell.char || " "
      ansiLine += char
      plainLine += char
    }

    // Close open hyperlink at end of row
    if (currentHyperlink) {
      ansiLine += "\x1b]8;;\x1b\\"
    }

    // Reset style at end of row
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      ansiLine += styleResetCodes(currentStyle)
    }

    rows.push(trimTrailingWhitespacePreservingAnsi(ansiLine))
    plainTextRows.push(plainLine.trimEnd())
  }

  return { rows, plainTextRows }
}
