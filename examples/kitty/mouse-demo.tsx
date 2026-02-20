/**
 * Drawing Canvas
 *
 * Click-drag to draw pixel art on a terminal canvas using half-block characters.
 * Each terminal cell holds 2 vertical pixels using Unicode half-block technique.
 *
 * Features:
 * - Half-block pixel art (2x vertical resolution)
 * - Color palette with 16 colors
 * - Pen and eraser tools
 * - Keyboard shortcuts for color/tool selection
 *
 * Run: bun vendor/beorn-inkx/examples/kitty/mouse-demo.tsx
 */

import { createTerm, enableMouse, disableMouse, parseMouseSequence, isMouseSequence } from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Drawing Canvas",
  description: "Click-drag to draw with half-block pixel art, color palette",
  features: ["parseMouseSequence()", "enableMouse()", "half-block rendering", "drag tracking"],
}

// Half-block characters for 2x vertical resolution
const UPPER_HALF = "\u2580" // ▀ — top filled, bottom empty
const LOWER_HALF = "\u2584" // ▄ — top empty, bottom filled
const FULL_BLOCK = "\u2588" // █ — both filled

// Color palette: [name, r, g, b]
const PALETTE: [string, number, number, number][] = [
  ["black", 0, 0, 0],
  ["red", 205, 0, 0],
  ["green", 0, 205, 0],
  ["yellow", 205, 205, 0],
  ["blue", 0, 0, 238],
  ["magenta", 205, 0, 205],
  ["cyan", 0, 205, 205],
  ["white", 229, 229, 229],
  ["bright black", 127, 127, 127],
  ["bright red", 255, 0, 0],
  ["bright green", 0, 255, 0],
  ["bright yellow", 255, 255, 0],
  ["bright blue", 92, 92, 255],
  ["bright magenta", 255, 0, 255],
  ["bright cyan", 0, 255, 255],
  ["bright white", 255, 255, 255],
]

type Tool = "pen" | "eraser"

interface CanvasState {
  /** 2D array of pixel colors (null = empty). Width x Height where height = rows*2 */
  pixels: (number | null)[][]
  /** Canvas width in terminal columns */
  width: number
  /** Canvas height in pixel rows (2x terminal rows) */
  height: number
  /** Currently selected color index */
  colorIndex: number
  /** Current tool */
  tool: Tool
  /** Mouse position for status bar */
  mouseX: number
  mouseY: number
  /** Whether mouse is currently pressed */
  isDrawing: boolean
}

function createCanvas(cols: number, rows: number): CanvasState {
  // Reserve 3 rows: 1 for header, 1 for palette, 1 for status
  const canvasRows = rows - 3
  const width = cols
  const height = canvasRows * 2 // half-block doubles vertical resolution

  const pixels: (number | null)[][] = []
  for (let y = 0; y < height; y++) {
    pixels.push(new Array(width).fill(null))
  }

  return {
    pixels,
    width,
    height,
    colorIndex: 15, // bright white
    tool: "pen",
    mouseX: 0,
    mouseY: 0,
    isDrawing: false,
  }
}

function setPixel(state: CanvasState, termX: number, termY: number): void {
  // termY is relative to terminal row; row 0 is the header
  // Canvas starts at row 1
  const canvasTermRow = termY - 1
  if (canvasTermRow < 0) return

  const pixelY0 = canvasTermRow * 2
  const pixelY1 = pixelY0 + 1

  // For simplicity, set both sub-pixels in the cell the mouse is in
  // This gives a natural brush feel
  const x = termX
  if (x < 0 || x >= state.width) return

  const value = state.tool === "pen" ? state.colorIndex : null

  if (pixelY0 >= 0 && pixelY0 < state.height) {
    state.pixels[pixelY0]![x] = value
  }
  if (pixelY1 >= 0 && pixelY1 < state.height) {
    state.pixels[pixelY1]![x] = value
  }
}

function renderFrame(state: CanvasState, term: ReturnType<typeof createTerm>): string {
  const lines: string[] = []

  // Header
  const toolLabel = state.tool === "pen" ? "Pen" : "Eraser"
  const colorName = PALETTE[state.colorIndex]![0]
  const [, cr, cg, cb] = PALETTE[state.colorIndex]!
  const colorSwatch = term.bgRgb(cr!, cg!, cb!)(" ")
  lines.push(
    term.dim.yellow("▸ inkx") +
      " " +
      term.bold("Drawing Canvas") +
      " " +
      term.dim("— click-drag to draw") +
      "  " +
      term.dim("1-9/0 color  e eraser  c clear  q quit"),
  )

  // Canvas: convert pixel pairs to half-block characters
  const canvasRows = Math.floor(state.height / 2)
  for (let row = 0; row < canvasRows; row++) {
    let line = ""
    for (let col = 0; col < state.width; col++) {
      const topPixel = state.pixels[row * 2]![col]
      const bottomPixel = state.pixels[row * 2 + 1]![col]

      if (topPixel === null && bottomPixel === null) {
        // Both empty
        line += " "
      } else if (topPixel !== null && bottomPixel === null) {
        // Top filled, bottom empty: use ▀ with fg=top color
        const [, r, g, b] = PALETTE[topPixel]!
        line += term.rgb(r!, g!, b!)(UPPER_HALF)
      } else if (topPixel === null && bottomPixel !== null) {
        // Top empty, bottom filled: use ▄ with fg=bottom color
        const [, r, g, b] = PALETTE[bottomPixel]!
        line += term.rgb(r!, g!, b!)(LOWER_HALF)
      } else if (topPixel === bottomPixel) {
        // Both same color: use █ with fg=color
        const [, r, g, b] = PALETTE[topPixel!]!
        line += term.rgb(r!, g!, b!)(FULL_BLOCK)
      } else {
        // Both filled, different colors: ▀ with fg=top, bg=bottom
        const [, tr, tg, tb] = PALETTE[topPixel!]!
        const [, br, bg, bb] = PALETTE[bottomPixel!]!
        line += term.rgb(tr!, tg!, tb!).bgRgb(br!, bg!, bb!)(UPPER_HALF)
      }
    }
    lines.push(line)
  }

  // Palette row
  let paletteLine = " "
  for (let i = 0; i < PALETTE.length; i++) {
    const [, r, g, b] = PALETTE[i]!
    const label = i < 9 ? String(i + 1) : i === 9 ? "0" : " "
    if (i === state.colorIndex) {
      // Selected: invert with brackets
      paletteLine += term.bold.inverse.rgb(r!, g!, b!)(`[${label}]`)
    } else {
      paletteLine += term.bgRgb(r!, g!, b!)(` ${label} `)
    }
  }
  lines.push(paletteLine)

  // Status bar
  const pos = `(${state.mouseX}, ${state.mouseY})`
  lines.push(
    ` ${term.dim("Tool:")} ${term.bold(toolLabel)}` +
      `  ${term.dim("Color:")} ${colorSwatch} ${colorName}` +
      `  ${term.dim("Pos:")} ${pos}` +
      `  ${term.dim("Canvas:")} ${state.width}x${state.height}`,
  )

  return lines.join("\n")
}

async function main() {
  using term = createTerm()
  const cols = term.cols ?? 80
  const rows = term.rows ?? 24

  const state = createCanvas(cols, rows)

  const { stdin, stdout } = process

  // Enable raw mode and mouse tracking
  if (stdin.isTTY) {
    stdin.setRawMode(true)
  }
  stdin.resume()
  stdout.write(enableMouse())

  // Hide cursor
  stdout.write("\x1b[?25l")

  // Clear screen and render initial frame
  stdout.write("\x1b[2J\x1b[H")
  stdout.write(renderFrame(state, term))

  const redraw = () => {
    stdout.write("\x1b[H") // Move cursor to top-left
    stdout.write(renderFrame(state, term))
  }

  const onData = (data: Buffer) => {
    const raw = data.toString()

    // Check for mouse events
    if (isMouseSequence(raw)) {
      const parsed = parseMouseSequence(raw)
      if (!parsed) return

      state.mouseX = parsed.x
      state.mouseY = parsed.y

      if (parsed.action === "down" && parsed.button === 0) {
        state.isDrawing = true
        setPixel(state, parsed.x, parsed.y)
        redraw()
      } else if (parsed.action === "move" && state.isDrawing) {
        setPixel(state, parsed.x, parsed.y)
        redraw()
      } else if (parsed.action === "up") {
        state.isDrawing = false
        redraw()
      } else {
        redraw()
      }
      return
    }

    // Keyboard input
    for (const ch of raw) {
      if (ch === "q" || ch === "\x1b") {
        // Quit
        cleanup()
        return
      }

      if (ch === "e") {
        // Toggle eraser
        state.tool = state.tool === "eraser" ? "pen" : "eraser"
        redraw()
      } else if (ch === "c") {
        // Clear canvas
        for (let y = 0; y < state.height; y++) {
          state.pixels[y]!.fill(null)
        }
        redraw()
      } else if (ch >= "1" && ch <= "9") {
        // Select color 1-9 (palette index 0-8)
        state.colorIndex = Number(ch) - 1
        state.tool = "pen"
        redraw()
      } else if (ch === "0") {
        // Select color 10 (palette index 9)
        state.colorIndex = 9
        state.tool = "pen"
        redraw()
      }
    }
  }

  const cleanup = () => {
    stdout.write(disableMouse())
    stdout.write("\x1b[?25h") // Show cursor
    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }
    stdin.off("data", onData)
    stdin.pause()
    process.exit(0)
  }

  stdin.on("data", onData)

  // Handle terminal resize
  stdout.on("resize", () => {
    const newCols = stdout.columns ?? cols
    const newRows = stdout.rows ?? rows
    // Rebuild canvas on resize
    const newState = createCanvas(newCols, newRows)
    // Copy existing pixels that still fit
    for (let y = 0; y < Math.min(state.height, newState.height); y++) {
      for (let x = 0; x < Math.min(state.width, newState.width); x++) {
        newState.pixels[y]![x] = state.pixels[y]![x]!
      }
    }
    state.pixels = newState.pixels
    state.width = newState.width
    state.height = newState.height
    stdout.write("\x1b[2J\x1b[H")
    redraw()
  })
}

if (import.meta.main) {
  main().catch(console.error)
}
