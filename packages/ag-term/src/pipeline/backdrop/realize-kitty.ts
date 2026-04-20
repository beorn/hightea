/**
 * Backdrop fade — stage 2b: emit the Kitty graphics overlay for the plan.
 *
 * The output always begins with `CURSOR_SAVE + kittyDeleteAllScrimPlacements()
 * + CURSOR_RESTORE` when `plan.active` is true — even when zero emoji cells
 * fall inside the faded region this frame. The unconditional clear is what
 * erases stale placements from a previous frame (e.g., a modal that covered
 * an emoji in frame N, then moved in frame N+1). Without it, orphan scrim
 * rectangles persist on screen.
 *
 * ### STRICT determinism invariant
 *
 * For a given `(plan, buffer)` pair, this function produces a byte-identical
 * string on every invocation. STRICT mode compares the overlay across
 * fresh and incremental paths to catch latent non-determinism in marker
 * collection order, emoji walk ordering, or placement ID derivation.
 *
 * @see ./plan.ts for the FadePlan shape and color model.
 * @see ./realize-buffer.ts for the complementary cell-level transform.
 */

import {
  backdropPlacementId,
  buildScrimPixels,
  cupTo,
  CURSOR_RESTORE,
  CURSOR_SAVE,
  kittyDeleteAllScrimPlacements,
  kittyPlaceAt,
  kittyUploadScrimImage,
} from "@silvery/ansi"
import type { TerminalBuffer } from "../../buffer"
import { isLikelyEmoji } from "../../unicode"
import { hexToRgb } from "./color"
import type { FadePlan, FadeRect } from "./plan"

/**
 * Stage 2b — emit the Kitty graphics overlay for the plan.
 *
 * The output always begins with `CURSOR_SAVE + kittyDeleteAllScrimPlacements()
 * + CURSOR_RESTORE` when `plan.active` is true — even when zero emoji cells
 * fall inside the faded region this frame. The unconditional clear is what
 * erases stale placements from a previous frame.
 *
 * Returns `""` when `plan.active` is false. Callers that also need to
 * suppress the overlay because Kitty graphics are not available should NOT
 * call this function at all — the ag-term orchestrator guards the call site
 * with its own `kittyEnabled` flag.
 */
export function realizeFadePlanToKittyOverlay(plan: FadePlan, buffer: TerminalBuffer): string {
  if (!plan.active) return ""

  return buildKittyOverlay(buffer, plan.includes, plan.excludes, plan.scrim, plan.defaultBg, plan.amount)
}

/**
 * Build the Kitty graphics escape sequence that covers wide-char cells in the
 * backdrop region with a translucent scrim.
 *
 * The scrim alpha matches the fade `amount` (scaled 0-255) so the composited
 * emoji bg lands at the same luminance as surrounding text cells: both
 * produce `cell_bg * (1 - amount) + scrim * amount`.
 *
 * Always emits at least `CURSOR_SAVE + kittyDeleteAllScrimPlacements() +
 * CURSOR_RESTORE` when called — even with zero wide cells in the region —
 * so stale placements from a previous frame get cleared. Without the
 * unconditional clear, an emoji visible under a modal in frame N could
 * persist as an orphan scrim into frame N+1 after the modal closes.
 */
function buildKittyOverlay(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
  scrim: string | null,
  defaultBg: string | null,
  amount: number,
): string {
  const cells = collectEmojiCellsInFadeRegion(buffer, includes, excludes)

  // Tint the scrim with the same color used for cell mixing (pure black /
  // white by theme luminance). Fallback to pure black.
  const tintHex = scrim ?? defaultBg ?? "#000000"
  const tint = hexToRgb(tintHex) ?? { r: 0, g: 0, b: 0 }
  const scrimAlpha = Math.max(0, Math.min(255, Math.round(amount * 255)))

  const parts: string[] = []
  parts.push(CURSOR_SAVE)

  if (cells.length === 0) {
    // No wide cells to cover this frame, but we must still clear any
    // placements left over from a prior frame where there were some.
    parts.push(kittyDeleteAllScrimPlacements())
    parts.push(CURSOR_RESTORE)
    return parts.join("")
  }

  const pixels = buildScrimPixels(tint, scrimAlpha)
  parts.push(kittyUploadScrimImage(pixels, 2, 2))
  parts.push(kittyDeleteAllScrimPlacements())

  for (const { x, y } of cells) {
    parts.push(cupTo(x, y))
    parts.push(
      kittyPlaceAt({
        placementId: backdropPlacementId(x, y),
        cols: 2,
        rows: 1,
        z: 1,
      }),
    )
  }
  parts.push(CURSOR_RESTORE)
  return parts.join("")
}

/**
 * Walk the include and exclude rects and collect the coordinates of every
 * EMOJI lead cell inside a faded region. CJK and other wide TEXT cells are
 * excluded — they respond to fg color mixing like normal text and don't
 * need the Kitty overlay. Only bitmap-glyph cells (detected via
 * `isLikelyEmoji(cell.char)`) need an overlay because their rendering
 * ignores the fg color.
 */
function collectEmojiCellsInFadeRegion(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
): Array<{ x: number; y: number }> {
  const seen = new Set<number>() // encoded y * W + x
  const out: Array<{ x: number; y: number }> = []

  const add = (x: number, y: number) => {
    if (x + 1 >= buffer.width) return // no room for continuation
    if (!buffer.isCellWide(x, y)) return
    if (buffer.isCellContinuation(x, y)) return
    const cell = buffer.getCell(x, y)
    if (!isLikelyEmoji(cell.char ?? "")) return
    const key = y * buffer.width + x
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, y })
  }

  for (const { rect } of includes) {
    const x0 = Math.max(0, rect.x)
    const y0 = Math.max(0, rect.y)
    const x1 = Math.min(buffer.width, rect.x + rect.width)
    const y1 = Math.min(buffer.height, rect.y + rect.height)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) add(x, y)
    }
  }

  if (excludes.length > 0) {
    for (const { rect } of excludes) {
      const ix0 = Math.max(0, rect.x)
      const iy0 = Math.max(0, rect.y)
      const ix1 = Math.min(buffer.width, rect.x + rect.width)
      const iy1 = Math.min(buffer.height, rect.y + rect.height)
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
          if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue
          add(x, y)
        }
      }
    }
  }

  return out
}
