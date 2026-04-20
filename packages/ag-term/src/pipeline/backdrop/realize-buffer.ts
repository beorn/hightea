/**
 * Backdrop fade — stage 2a: apply the plan's cell-level transform to the
 * terminal buffer.
 *
 * Walks every include rect (fade cells INSIDE) and every exclude rect (fade
 * cells OUTSIDE). Trusts the plan: no marker re-collection, no
 * scrim/default resolution, no amount validation.
 *
 * Wide ≠ emoji. CJK / Hangul / Japanese fullwidth text occupies two columns
 * but responds to `fg` color normally — it goes through the standard mix
 * path. Only EMOJI (bitmap glyphs that ignore `fg`) need special handling,
 * detected via `isLikelyEmoji(cell.char)`.
 *
 * For emoji cells, two paths, mutually exclusive:
 *
 * 1. **Kitty graphics available** (`kittyEnabled === true`): emoji cells
 *    are SKIPPED entirely here. `../realize-kitty.ts` emits a translucent
 *    scrim image at alpha=amount above each emoji cell, and the terminal
 *    composites the overlay on top of the unmixed cell, landing at
 *    `cell_bg * (1 - amount) + scrim * amount` — the same luminance as
 *    surrounding text cells. This avoids the double-fade that would make
 *    emoji bg visibly blacker.
 *
 * 2. **Kitty graphics unavailable** (`kittyEnabled === false`): the
 *    per-cell mix runs on emoji cells too and stamps `attrs.dim` (SGR 2)
 *    on lead + continuation. Terminals honoring SGR 2 on emoji fade the
 *    glyph; others see the glyph at full brightness but the cell bg
 *    matches surroundings.
 *
 * @see ./plan.ts for the color model and scrim derivation.
 * @see ./color.ts for the sRGB / OKLCH color math.
 */

import type { Rect } from "@silvery/ag/types"
import type { TerminalBuffer } from "../../buffer"
import { isLikelyEmoji } from "../../unicode"
import { colorToHex, deemphasizeOklch, hexToRgb, mixSrgb } from "./color"
import { DARK_SCRIM, LIGHT_SCRIM, type FadePlan } from "./plan"

/**
 * Stage 2a — apply the plan's cell-level transform to the buffer.
 *
 * Walks every include rect (fade cells INSIDE) and every exclude rect (fade
 * cells OUTSIDE). Trusts the plan: no marker re-collection, no
 * scrim/default resolution, no amount validation.
 *
 * When `kittyEnabled === true`, emoji cells (detected via
 * `isLikelyEmoji(cell.char)`) are SKIPPED — the Kitty overlay realizer
 * composites the scrim on top of the unmixed cell. When
 * `kittyEnabled === false`, emoji cells go through the per-cell mix AND
 * get SGR 2 (`attrs.dim`) stamped on lead + continuation.
 *
 * Returns `true` when at least one buffer cell was mutated.
 */
export function realizeFadePlanToBuffer(
  plan: FadePlan,
  buffer: TerminalBuffer,
  kittyEnabled: boolean,
): boolean {
  if (!plan.active) return false

  let bufferModified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of plan.includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, plan.scrim, plan.defaultBg, plan.defaultFg, kittyEnabled))
      bufferModified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole").
  if (plan.excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of plan.excludes) {
      if (amount <= 0) continue
      if (
        fadeRectExcluding(
          buffer,
          fullRect,
          rect,
          amount,
          plan.scrim,
          plan.defaultBg,
          plan.defaultFg,
          kittyEnabled,
        )
      )
        bufferModified = true
    }
  }

  return bufferModified
}

function fadeRect(
  buffer: TerminalBuffer,
  rect: Rect,
  amount: number,
  scrim: string | null,
  defaultBg: string | null,
  defaultFg: string | null,
  kittyEnabled: boolean,
): boolean {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(buffer.width, rect.x + rect.width)
  const y1 = Math.min(buffer.height, rect.y + rect.height)
  if (x0 >= x1 || y0 >= y1) return false

  let any = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (fadeCell(buffer, x, y, amount, scrim, defaultBg, defaultFg, kittyEnabled)) any = true
    }
  }
  return any
}

function fadeRectExcluding(
  buffer: TerminalBuffer,
  outer: Rect,
  inner: Rect,
  amount: number,
  scrim: string | null,
  defaultBg: string | null,
  defaultFg: string | null,
  kittyEnabled: boolean,
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
      if (fadeCell(buffer, x, y, amount, scrim, defaultBg, defaultFg, kittyEnabled)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * sRGB source-over alpha mix:
 *   fg' = fg * (1 - amount) + scrim * amount
 *   bg' = bg * (1 - amount) + scrim * amount
 *
 * `null`/`DEFAULT_BG` cells are resolved to the theme's `rootBg` first (that
 * IS the color the terminal paints), then mixed — so empty cells darken at
 * the same rate as explicitly-colored cells.
 *
 * Uniform amounts for fg + bg preserve relative brightness ordering across
 * borders vs fills. Heaviness is controlled by `amount` (default 0.25,
 * calibrated against macOS 0.20, Material 3 0.32, iOS 0.40, Flutter 0.54).
 *
 * When `scrim` is null (no theme context, e.g. bare `<Backdrop>` without
 * `<ThemeProvider>`): falls back to mixing fg toward cell.bg so the cell
 * still reads as "receded" without needing external theme info.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji using the glyph's own bitmap colors — the fg mix
 * has no visible effect on the emoji. Two paths, mutually exclusive:
 *
 * 1. Kitty graphics available: `fadeCell` SKIPS wide cells entirely. The
 *    Kitty overlay composites the scrim at alpha=amount on top, landing at
 *    `cell * (1 - amount) + scrim * amount` — same as surrounding cells.
 * 2. Kitty unavailable: mix the cell bg + stamp `attrs.dim` on lead +
 *    continuation. Terminals honoring SGR 2 on emoji fade the glyph.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  scrim: string | null,
  defaultBg: string | null,
  defaultFg: string | null,
  kittyEnabled: boolean,
): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 updates
  // this cell in lockstep when it's processed.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  // Glyph classification: only EMOJI cells (bitmap glyphs that ignore fg
  // color) go through the Kitty overlay path. CJK and other wide TEXT cells
  // respond to fg color like narrow text and go through the buffer mix
  // path, which is correct for them. `cell.wide` alone is the wrong
  // discriminator — wide != emoji — pro review flagged this as a bug class.
  const isEmojiGlyph = cell.wide && isLikelyEmoji(cell.char ?? "")

  // When Kitty is available and this cell is an emoji, skip the buffer mix
  // — the Kitty overlay will composite the scrim at alpha=amount above the
  // unmixed cell, landing at `cell_bg * (1 - amount) + scrim * amount`,
  // same luminance as surrounding mixed cells. Mixing here too would
  // double-fade and produce a visibly blacker emoji bg.
  if (kittyEnabled && isEmojiGlyph) return false

  const rawFgHex = colorToHex(cell.fg)

  if (scrim !== null && defaultBg !== null) {
    // Resolve null/default fg BEFORE deemphasize. Without this, default-fg
    // text (common in TUIs that don't set Text color explicitly) skips the
    // fade entirely — bg darkens but fg stays at full terminal brightness,
    // producing a visible "text POPS against faded bg" effect that users
    // perceive as "colors look more saturated when darkened".
    const fgHex =
      rawFgHex ??
      defaultFg ??
      // Last-ditch: opposite of scrim (white for dark scrim, black for light)
      (scrim === DARK_SCRIM ? LIGHT_SCRIM : DARK_SCRIM)

    // sRGB source-over mix: uniform bg toward scrim at `amount`. sRGB
    // matches the Kitty graphics overlay compositing so text-cell bg and
    // emoji-cell bg land at the same luminance in shared faded regions.
    const bgHex = colorToHex(cell.bg) ?? defaultBg
    const mixedBgHex = mixSrgb(bgHex, scrim, amount)
    const mixedBg = hexToRgb(mixedBgHex)

    // Stamp SGR 2 dim on emoji cells when Kitty is NOT available — it's the
    // only portable way to signal "faded" on a glyph the fg mix can't
    // affect. For wide TEXT (CJK etc.), do NOT stamp dim: the fg mix works
    // fine, and SGR 2 on CJK over-fades the glyph.
    const stampEmojiDim = isEmojiGlyph
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    // Fg uses OKLCH deemphasize — linear L, quadratic C, preserves H. See
    // `deemphasizeOklch` docblock for the perceptual rationale. Bg stays
    // sRGB to match Kitty overlay compositing.
    const deemphasizedFgHex = deemphasizeOklch(fgHex, amount)
    const mixedFg = hexToRgb(deemphasizedFgHex)

    if (mixedFg) {
      if (mixedBg) {
        buffer.setCell(x, y, { ...cell, fg: mixedFg, bg: mixedBg, attrs: newAttrs })
        propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
        return true
      }
      buffer.setCell(x, y, { ...cell, fg: mixedFg, attrs: newAttrs })
      if (stampEmojiDim) propagateDimToContinuation(buffer, cell, x, y)
      return true
    }

    // Fg deemphasize failed (rare — hex parse edge). Fall back to bg-only
    // mix + dim stamp.
    if (mixedBg) {
      buffer.setCell(x, y, { ...cell, bg: mixedBg, attrs: newAttrs })
      propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
      return true
    }
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  const fgHex = rawFgHex

  // Legacy path (no scrim): mix fg toward cell.bg.
  const bgHex = colorToHex(cell.bg)

  if (fgHex && bgHex) {
    const mixedHex = mixSrgb(fgHex, bgHex, amount)
    const mixedRgb = hexToRgb(mixedHex)
    if (!mixedRgb) return false
    buffer.setCell(x, y, { ...cell, fg: mixedRgb })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null) or fg null. Stamp dim so
  // the cell still reads as "backdrop".
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
  if (cell.wide && x + 1 < buffer.width) {
    const cont = buffer.getCell(x + 1, y)
    if (!cont.attrs.dim) {
      buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
    }
  }
  return true
}

/**
 * When the lead cell of a wide char (emoji, CJK) has its bg mixed, copy the
 * mixed bg to its continuation cell at x+1. Without this, the two halves of
 * an emoji end up with different bg, producing a visually-split glyph.
 *
 * When `stampDim=true` also stamps `attrs.dim` on the continuation.
 */
function propagateBgToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
  mixedBg: { r: number; g: number; b: number },
  stampDim: boolean,
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return
  const attrs = stampDim && !cont.attrs.dim ? { ...cont.attrs, dim: true } : cont.attrs
  buffer.setCell(x + 1, y, { ...cont, bg: mixedBg, attrs })
}

/**
 * Stamp `attrs.dim` on the continuation cell of a wide char when the lead
 * cell has been dimmed but no bg change needed propagation (e.g., lead cell
 * had null bg and only fg was mixed).
 */
function propagateDimToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return
  if (cont.attrs.dim) return
  buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
}
