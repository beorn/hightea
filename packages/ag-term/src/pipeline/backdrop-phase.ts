/**
 * Backdrop fade pass.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. Walks
 * the tree to find nodes with `data-backdrop-fade` or
 * `data-backdrop-fade-excluded` markers, then applies a cell-level color
 * transform to the affected rect(s) on the buffer.
 *
 * Tiers (`colorLevel`):
 * - `truecolor` / `256`: `cell.fg = blend(fg, bg, fadeAmount)` in OKLab via
 *   `@silvery/color`. Fully deterministic — produces hex output.
 * - `basic` (ANSI 16): stamps `attrs.dim` (SGR 2) on each cell. Can't blend
 *   arbitrary palette slots, so this is best-effort.
 * - `none` (monochrome): no-op. Modal border + box-drawing carry separation.
 *
 * # Incremental correctness
 *
 * The pass mutates the final buffer in place after the decoration phase. The
 * same buffer is what `ag.render()` stores as `_prevBuffer`. This is safe
 * because:
 *
 * 1. The backdrop pass is a pure function of (tree markers, buffer cells).
 * 2. `renderPhase` writes the same pre-transform pixels on both fresh and
 *    incremental paths (this is the existing incremental invariant).
 * 3. Running the same pure transform over both paths produces identical post-
 *    transform buffers — `SILVERY_STRICT=1` (cell-by-cell compare between
 *    incremental and fresh render) stays green.
 * 4. On the NEXT frame, `renderPhase` clones the post-transform buffer.
 *    Cells in backdrop regions stay faded (fast-path skipped). Dirty cells
 *    get re-rendered with pre-transform content, then the pass re-applies
 *    fade. Result matches a fresh render.
 *
 * If the backdrop region itself moves (modal open/close, Backdrop mount/
 * unmount), the tree change triggers dirty re-renders in the affected area.
 * The new region is computed from the current tree — the pass doesn't carry
 * state across frames.
 */

import { blend } from "@silvery/theme"
import type { AgNode, Rect } from "@silvery/ag/types"
import { ansi256ToRgb, isDefaultBg, type Color, type TerminalBuffer } from "../buffer"

export type BackdropColorLevel = "none" | "basic" | "256" | "truecolor"

export interface BackdropFadeOptions {
  /** Terminal color tier. Controls which transform strategy runs. */
  colorLevel?: BackdropColorLevel
}

const FADE_ATTR = "data-backdrop-fade"
const FADE_EXCLUDE_ATTR = "data-backdrop-fade-excluded"

interface FadeRect {
  rect: Rect
  amount: number
}

/**
 * Apply backdrop-fade to the buffer based on tree markers.
 *
 * Returns `true` if at least one region was modified; `false` if nothing
 * changed (no markers found, or colorLevel is `none`).
 */
export function applyBackdropFade(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropFadeOptions,
): boolean {
  const colorLevel: BackdropColorLevel = options?.colorLevel ?? "truecolor"
  if (colorLevel === "none") return false

  const includes: FadeRect[] = []
  const excludes: FadeRect[] = []
  collectBackdropMarkers(root, includes, excludes)

  if (includes.length === 0 && excludes.length === 0) return false

  const strategy: FadeStrategy = colorLevel === "basic" ? "dim" : "blend"

  let modified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, strategy)) modified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole"). When multiple excluded rects exist, each
  // is processed independently: the union of their rects is the crisp region.
  if (excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of excludes) {
      if (amount <= 0) continue
      if (fadeRectExcluding(buffer, fullRect, rect, amount, strategy)) modified = true
    }
  }

  return modified
}

type FadeStrategy = "blend" | "dim"

function collectBackdropMarkers(node: AgNode, includes: FadeRect[], excludes: FadeRect[]): void {
  const props = node.props as Record<string, unknown>
  const includeRaw = props[FADE_ATTR]
  const excludeRaw = props[FADE_EXCLUDE_ATTR]

  if (includeRaw !== undefined || excludeRaw !== undefined) {
    const rect = node.screenRect ?? node.scrollRect ?? node.boxRect
    if (rect && rect.width > 0 && rect.height > 0) {
      const inc = parseFade(includeRaw)
      if (inc !== null) includes.push({ rect, amount: inc })
      const exc = parseFade(excludeRaw)
      if (exc !== null) excludes.push({ rect, amount: exc })
    }
  }

  for (const child of node.children) {
    collectBackdropMarkers(child, includes, excludes)
  }
}

function parseFade(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  return n > 1 ? 1 : n
}

function fadeRect(
  buffer: TerminalBuffer,
  rect: Rect,
  amount: number,
  strategy: FadeStrategy,
): boolean {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(buffer.width, rect.x + rect.width)
  const y1 = Math.min(buffer.height, rect.y + rect.height)
  if (x0 >= x1 || y0 >= y1) return false

  let any = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (fadeCell(buffer, x, y, amount, strategy)) any = true
    }
  }
  return any
}

function fadeRectExcluding(
  buffer: TerminalBuffer,
  outer: Rect,
  inner: Rect,
  amount: number,
  strategy: FadeStrategy,
): boolean {
  const ox0 = Math.max(0, outer.x)
  const oy0 = Math.max(0, outer.y)
  const ox1 = Math.min(buffer.width, outer.x + outer.width)
  const oy1 = Math.min(buffer.height, outer.y + outer.height)

  const ix0 = Math.max(ox0, inner.x)
  const iy0 = Math.max(oy0, inner.y)
  const ix1 = Math.min(ox1, inner.x + inner.width)
  const iy1 = Math.min(oy1, inner.y + inner.height)
  const innerValid = ix0 < ix1 && iy0 < iy1

  let any = false
  for (let y = oy0; y < oy1; y++) {
    for (let x = ox0; x < ox1; x++) {
      if (innerValid && x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue
      if (fadeCell(buffer, x, y, amount, strategy)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * - `blend` strategy: mix fg toward bg in OKLab. When either color is null or
 *   the default-bg sentinel, also stamps `dim`.
 * - `dim` strategy: stamp `dim` attribute.
 *
 * Wide-char continuation cells are skipped — they share styling with the
 * leading cell and modifying them separately would desync.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  strategy: FadeStrategy,
): boolean {
  // Skip continuation half of wide chars — the leading cell carries the style.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  if (strategy === "dim") {
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  // strategy === "blend"
  const fgHex = colorToHex(cell.fg)
  const bgHex = colorToHex(cell.bg)

  if (fgHex && bgHex) {
    // OKLab blend fg toward bg. amount=0.4 means 40% of the way to bg.
    const blendedHex = blend(fgHex, bgHex, amount)
    const blendedRgb = hexToRgb(blendedHex)
    if (!blendedRgb) return false
    buffer.setCell(x, y, { ...cell, fg: blendedRgb })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null) or fg null. Stamp dim so
  // the cell still reads as "backdrop". This covers cells that inherit the
  // terminal bg where we can't compute a blend target.
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
  return true
}

/** Convert a buffer Color to a `#rrggbb` hex string, or null if unresolvable. */
function colorToHex(color: Color): string | null {
  if (color === null) return null
  if (typeof color === "number") {
    const rgb = ansi256ToRgb(color)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  if (isDefaultBg(color)) return null
  return rgbToHex(color.r, color.g, color.b)
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => {
    const v = Math.max(0, Math.min(255, Math.round(n)))
    return v.toString(16).padStart(2, "0")
  }
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null
  let s = hex
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) {
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  }
  if (s.length !== 6) return null
  const r = parseInt(s.slice(0, 2), 16)
  const g = parseInt(s.slice(2, 4), 16)
  const b = parseInt(s.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}
