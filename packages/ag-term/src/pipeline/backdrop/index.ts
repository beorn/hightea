/**
 * Backdrop fade pass — mask → realize two-stage model.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. The
 * pipeline orchestrator (`ag.ts`) invokes `applyBackdropFade(root, buffer,
 * options)`, which performs two independent stages:
 *
 *   1. `buildFadePlan(root, options)` — PURE, capability-independent tree
 *      walk. Collects `data-backdrop-fade` / `data-backdrop-fade-excluded`
 *      markers, enforces the single-amount invariant, resolves the scrim +
 *      default colors. See `./plan.ts`.
 *   2a. `realizeFadePlanToBuffer(plan, buffer, kittyEnabled)` — cell-level
 *      transform over the plan's include/exclude rects. Mutates the buffer
 *      in place. See `./realize-buffer.ts`.
 *   2b. `realizeFadePlanToKittyOverlay(plan, buffer)` — emits the Kitty
 *      graphics escape sequence for emoji cells in the faded region. See
 *      `./realize-kitty.ts`.
 *
 * The split exists so each stage is independently testable and so
 * STRICT-mode diagnostics can compare plans + overlays across
 * fresh/incremental paths without re-walking the buffer.
 *
 * ## Incremental correctness
 *
 * The pass mutates the final buffer in place after the decoration phase. The
 * PRE-transform buffer is snapshotted and stored as `_prevBuffer` (see
 * `ag.ts`), so the next frame's incremental render clones pre-fade pixels
 * and re-fades them freshly. Because `buildFadePlan` is pure and the
 * realizers trust the plan, fresh and incremental paths produce identical
 * post-transform buffers — `SILVERY_STRICT=1` stays green.
 *
 * **STRICT overlay invariant**: `realizeFadePlanToKittyOverlay` is a pure
 * function of `(plan, buffer)`. When the same tree is rendered via the
 * fresh path and the incremental path within a single frame, both produce
 * byte-identical Kitty overlay strings. STRICT mode compares these
 * overlays alongside the buffer (see `scheduler.ts`) — any drift signals a
 * latent determinism bug in marker collection or the emoji walk.
 *
 * ## Emoji vs wide-text cells
 *
 * Wide ≠ emoji. CJK / Hangul / Japanese fullwidth text occupies two columns
 * but responds to `fg` color normally — it goes through the standard mix
 * path. Only EMOJI (bitmap glyphs that ignore `fg`) need special handling,
 * detected via `isLikelyEmoji(cell.char)`. See `./realize-buffer.ts` for
 * the full text-vs-emoji decision table.
 */

import type { AgNode } from "@silvery/ag/types"
import type { TerminalBuffer } from "../../buffer"
import { buildFadePlan, type BackdropFadeOptions } from "./plan"
import { realizeFadePlanToBuffer } from "./realize-buffer"
import { realizeFadePlanToKittyOverlay } from "./realize-kitty"

// Public re-exports — callers import from `./pipeline/backdrop` (the barrel
// below) or from `./pipeline` (which re-re-exports).
export {
  buildFadePlan,
  hasBackdropMarkers,
  type BackdropColorLevel,
  type BackdropFadeOptions,
  type FadePlan,
  type FadeRect,
} from "./plan"
export { realizeFadePlanToBuffer } from "./realize-buffer"
export { realizeFadePlanToKittyOverlay } from "./realize-kitty"

/**
 * Result of `applyBackdropFade`.
 *
 * The split between `bufferModified` and `visuallyModified` reflects that
 * Kitty-capable terminals can change the visible frame without mutating
 * any buffer cells (pure overlay). Callers gating on "did anything change"
 * should check `visuallyModified`; callers logging buffer-cell stats
 * should check `bufferModified`. `modified` is a pre-split alias kept for
 * backward compatibility — it equals `bufferModified`.
 */
export interface BackdropFadeResult {
  /** @deprecated alias for `bufferModified`. */
  modified: boolean
  /** True when at least one buffer cell was mutated by the pass. */
  bufferModified: boolean
  /** True when the visible frame differs from pre-fade: buffer OR overlay. */
  visuallyModified: boolean
  /**
   * Out-of-band ANSI escapes appended after the normal output phase diff.
   * Non-empty whenever Kitty graphics are enabled AND a backdrop is active
   * — includes a delete-all-placements command so last-frame scrims get
   * cleared even if this frame has no wide cells.
   */
  kittyOverlay: string
}

const EMPTY_RESULT: BackdropFadeResult = {
  modified: false,
  bufferModified: false,
  visuallyModified: false,
  kittyOverlay: "",
}

/**
 * Apply backdrop-fade to the buffer based on tree markers.
 *
 * Thin orchestrator over the mask → realize stages:
 *
 *   plan = buildFadePlan(root, options)
 *   bufferModified = realizeFadePlanToBuffer(plan, buffer, kittyEnabled)
 *   kittyOverlay = kittyEnabled ? realizeFadePlanToKittyOverlay(plan, buffer) : ""
 *
 * Returns a `BackdropFadeResult`:
 * - `bufferModified` — any buffer cells changed (STRICT compares buffers;
 *   this is the narrow "did we mutate the buffer" signal).
 * - `visuallyModified` — the visible frame differs from the pre-fade state.
 *   True when buffer cells changed OR a Kitty overlay is emitted. Callers
 *   that gate re-render on "anything changed" should check this field.
 * - `kittyOverlay` — out-of-band ANSI escapes. Non-empty when Kitty graphics
 *   are enabled AND backdrop is active: contains at minimum a scrim-clear
 *   command so last-frame placements get erased even if this frame has no
 *   wide cells. Empty only when Kitty is disabled or backdrop is inactive.
 * - `modified` — deprecated alias for `bufferModified`, kept for callers
 *   that predate the visual/buffer split.
 */
export function applyBackdropFade(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropFadeOptions,
): BackdropFadeResult {
  const plan = buildFadePlan(root, options)
  if (!plan.active) return EMPTY_RESULT

  // Kitty graphics realize the scrim for emoji cells (not CJK text — they
  // respond to fg like normal text). The overlay composites at alpha=amount
  // above the unmixed cell. Require a resolved scrim.
  const kittyEnabled = options?.kittyGraphics === true && plan.scrim !== null

  const bufferModified = realizeFadePlanToBuffer(plan, buffer, kittyEnabled)

  // Kitty overlay. Always emitted when kittyEnabled (even if no emoji this
  // frame) so last-frame placements get cleared by the delete-all at the
  // head of the overlay string.
  const kittyOverlay = kittyEnabled ? realizeFadePlanToKittyOverlay(plan, buffer) : ""

  const visuallyModified = bufferModified || kittyOverlay !== ""

  return {
    modified: bufferModified,
    bufferModified,
    visuallyModified,
    kittyOverlay,
  }
}
