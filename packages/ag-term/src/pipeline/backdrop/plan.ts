/**
 * Backdrop fade — stage 1: build the immutable `FadePlan`.
 *
 * `buildFadePlan(root, options)` is a PURE, capability-independent pass that
 * walks the tree, collects `data-backdrop-fade` / `data-backdrop-fade-excluded`
 * markers, enforces the single-amount invariant, and resolves the scrim +
 * default colors. The realizers (`../realize-buffer.ts`,
 * `../realize-kitty.ts`) trust the plan: they do NOT re-walk the tree,
 * re-resolve the scrim, or re-validate amounts. This module is the single
 * source of truth.
 *
 * ## The model: per-channel alpha scrim with perceptually-aware fg
 *
 * The pass fades every covered cell by blending BOTH fg AND bg toward a
 * neutral scrim color at the caller's `amount`. Default scrim: pure black
 * for dark themes (Apple `colorWithWhite:0.0 alpha:0.4`), pure white for
 * light. Default amount: 0.25 (calibrated against macOS 0.20, Material 3
 * 0.32, iOS 0.40, Flutter 0.54).
 *
 * ### Two operations, one per channel
 *
 *   fg' = deemphasize(fg, amount)     // OKLCH: L*=(1-α), C*=(1-α)², H preserved
 *   bg' = mixSrgb(bg, scrim, amount)  // sRGB source-over alpha
 *
 * Why the split: foreground colored text is where users notice "darkened
 * colors look MORE saturated" — human vision reads chroma RELATIVE to
 * luminance nonlinearly. The quadratic chroma falloff in `deemphasize`
 * compensates: chroma drops faster than lightness, producing a perceptually
 * muted result rather than an "intensified dark" — a pale lavender becomes
 * dull slate, not deep indigo. Background uses sRGB source-over because the
 * Kitty graphics scrim overlay composites in sRGB at alpha at the hardware
 * level. See `../color.ts` for the math.
 *
 * ### Uniform amount per channel, heaviness tuned at call site
 *
 * Both fg and bg use the same `amount`. An earlier revision halved bg
 * amount to prevent "scene drowning" — that caused border/panel brightness
 * inversion (fg-dominated border darkens faster than bg-dominated fill).
 * Heaviness is controlled by `amount`, not by asymmetric math.
 *
 * ## Scrim color
 *
 * - Dark themes: pure black (`#000000`) — Apple's modal-sheet dimming color.
 * - Light themes: pure white (`#ffffff`) — the sign-flipped equivalent.
 *
 * Null-bg cells are resolved to rootBg first, then `mixSrgb` toward the
 * scrim — empty cells darken at the same rate as explicitly-colored ones.
 *
 * Tiers (`colorLevel`): a single code path for all supported tiers. For
 * `"none"` (monochrome) the pass short-circuits to a no-op. For `basic`,
 * `256`, and `truecolor`, the per-cell operation is identical — the output
 * phase quantizes the mixed truecolor hex to the tier's palette on emit.
 */

import { relativeLuminance } from "@silvery/color"
import type { AgNode, Rect } from "@silvery/ag/types"

export type BackdropColorLevel = "none" | "basic" | "256" | "truecolor"

export interface BackdropFadeOptions {
  /**
   * Terminal color tier. `"none"` short-circuits to a no-op (monochrome).
   * All other tiers run the same sRGB scrim mix — output phase quantizes
   * to the tier's palette on emit.
   */
  colorLevel?: BackdropColorLevel
  /**
   * Root background hex color from the active theme. Used as the implicit
   * `defaultBg` (for null/default cell bg) AND as the luminance source for
   * deriving the scrim. Kept for back-compat; prefer the split `defaultBg`
   * / `scrimColor` options.
   */
  rootBg?: string
  /**
   * Default background hex — resolves null/default `cell.bg` before mixing
   * toward the scrim. If omitted, falls back to `rootBg`.
   */
  defaultBg?: string
  /**
   * Default foreground hex — resolves null/default `cell.fg` before the
   * deemphasize pass. Without this, text using the terminal's default fg
   * would stay at full brightness against a darkened backdrop (looks like
   * the text is POPPING instead of receding). If omitted, the pass picks
   * the opposite of the scrim (white for dark scrim, black for light).
   */
  defaultFg?: string
  /**
   * Explicit scrim color, or `"auto"` (default) to derive from theme
   * luminance: pure black for dark themes, pure white for light. Apps that
   * want a tinted scrim (e.g., a mid-gray for flat-color TUIs) override
   * here.
   */
  scrimColor?: string | "auto"
  /**
   * When true, emit Kitty graphics protocol overlays on emoji cells inside
   * the faded region. The terminal renders a translucent scrim image above
   * the emoji glyph, which SGR 2 "dim" alone can't fade on bitmap emoji.
   *
   * CJK wide-char cells are NOT emoji — they respond to fg color like text,
   * so they go through the normal deemphasize path regardless of Kitty
   * availability. Only emoji cells (detected via `isLikelyEmoji`) skip the
   * buffer mix when Kitty is active.
   */
  kittyGraphics?: boolean
}

/** Marker prop key for include rects (fade cells INSIDE the node's rect). */
export const FADE_ATTR = "data-backdrop-fade"
/** Marker prop key for exclude rects (fade everything OUTSIDE the node's rect). */
export const FADE_EXCLUDE_ATTR = "data-backdrop-fade-excluded"

/**
 * Luminance threshold for dark/light theme detection.
 *
 * 0.18 is well below the WCAG midpoint. Standard dark terminal themes
 * (Catppuccin Mocha bg #1e1e2e, luminance ≈ 0.012; Tokyo Night bg #1a1b26,
 * ≈ 0.010) are well below. Light themes (GitHub Light #ffffff = 1.0) above.
 */
export const DARK_LUMINANCE_THRESHOLD = 0.18

/** Canonical scrim colors — Apple's `colorWithWhite:0.0` / `:1.0`. */
export const DARK_SCRIM = "#000000"
export const LIGHT_SCRIM = "#ffffff"

export interface FadeRect {
  rect: Rect
  amount: number
}

/**
 * The immutable output of `buildFadePlan` — a capability-independent
 * description of what the backdrop pass intends to do this frame.
 *
 * The realizers (`realizeFadePlanToBuffer`, `realizeFadePlanToKittyOverlay`)
 * trust the plan: they do NOT re-walk the tree, re-resolve the scrim, or
 * re-validate amounts. `buildFadePlan` is the single source of truth.
 *
 * ### Invariants enforced by `buildFadePlan`
 *
 * - `active = includes.length > 0 || excludes.length > 0` whenever a
 *   non-zero fade marker is present. The stage-1 pass short-circuits to an
 *   inactive plan for `colorLevel: "none"`.
 * - `amount ∈ [0, 1]`, clamped, and identical across all collected rects
 *   (single-amount invariant — mixed amounts break the Kitty overlay's
 *   one-image-one-alpha model; dev-mode warn, prod falls back to first).
 * - `scrim` is either a resolved hex color (for the truecolor/256 tiers
 *   with a known theme bg) or `null` (legacy fallback where `fadeCell`
 *   mixes fg toward cell.bg without a scrim).
 * - `defaultBg` / `defaultFg` are resolved for the stage-2 passes — the
 *   realizers substitute these when `cell.bg` / `cell.fg` is null.
 */
export interface FadePlan {
  /** True when the tree had at least one fade marker with amount > 0. */
  active: boolean
  /**
   * The enforced single amount for this frame, clamped to [0, 1]. Zero
   * when `active` is false.
   */
  amount: number
  /**
   * Resolved scrim hex, or null when no theme bg is available. The
   * buffer-realizer falls back to a legacy single-channel mix when null.
   */
  scrim: string | null
  /**
   * Default background hex for resolving null/default `cell.bg`. Derived
   * from `options.defaultBg` or `options.rootBg`.
   */
  defaultBg: string | null
  /**
   * Default foreground hex for resolving null/default `cell.fg`. Derived
   * from `options.defaultFg`, else the opposite of the scrim (white for
   * dark scrim, black for light).
   */
  defaultFg: string | null
  /** Rects marked `data-backdrop-fade` — fade cells INSIDE each rect. */
  includes: FadeRect[]
  /**
   * Rects marked `data-backdrop-fade-excluded` — fade everything OUTSIDE
   * each rect (the modal "cuts a hole").
   */
  excludes: FadeRect[]
}

/** Sentinel "nothing to do" plan — reused across frames to avoid allocations. */
export const INACTIVE_PLAN: FadePlan = {
  active: false,
  amount: 0,
  scrim: null,
  defaultBg: null,
  defaultFg: null,
  includes: [],
  excludes: [],
}

/**
 * Quick check: does the tree contain any backdrop markers? Used as a gate so
 * we don't clone the buffer every frame when no fade is active. Walks the
 * full tree once (O(N)) — the alternative (tracking dirty markers in the
 * reconciler) is more complex and the walk is cheap compared to the pass.
 */
export function hasBackdropMarkers(root: AgNode): boolean {
  const props = root.props as Record<string, unknown>
  if (props[FADE_ATTR] !== undefined || props[FADE_EXCLUDE_ATTR] !== undefined) return true
  for (const child of root.children) {
    if (hasBackdropMarkers(child)) return true
  }
  return false
}

/**
 * Stage 1 — build the immutable `FadePlan`.
 *
 * Pure function of `(tree markers, options)`. No buffer access, no Kitty
 * capability knowledge. The realizers read from the plan exclusively.
 *
 * Returns `INACTIVE_PLAN` when:
 * - `colorLevel === "none"` (monochrome terminal — pass is a no-op).
 * - The tree has no backdrop markers, OR all markers have `amount <= 0`.
 */
export function buildFadePlan(root: AgNode, options?: BackdropFadeOptions): FadePlan {
  const colorLevel: BackdropColorLevel = options?.colorLevel ?? "truecolor"
  if (colorLevel === "none") return INACTIVE_PLAN

  const includes: FadeRect[] = []
  const excludes: FadeRect[] = []
  collectBackdropMarkers(root, includes, excludes)

  if (includes.length === 0 && excludes.length === 0) return INACTIVE_PLAN

  // Resolve the three color inputs. Prefer the split options; fall back to
  // `rootBg` for back-compat.
  //   - defaultBg: used to resolve null/default cell.bg before sRGB mix
  //   - scrimColor: the target of the mix. "auto" (default) derives from bg
  //     luminance: black for dark themes, white for light.
  //   - defaultFg: used to resolve null/default cell.fg before deemphasize.
  //     Critical for default-fg text (common in TUIs that don't set colors
  //     on every Text node) — without it, default-fg cells skip the fade
  //     and the text pops against a dimmed bg.
  const defaultBg = options?.defaultBg ?? options?.rootBg ?? null
  const scrimColorOpt = options?.scrimColor
  const scrim =
    typeof scrimColorOpt === "string" && scrimColorOpt !== "auto"
      ? scrimColorOpt
      : deriveScrimColor(defaultBg)
  const defaultFg =
    options?.defaultFg ?? (scrim === null ? null : scrim === DARK_SCRIM ? LIGHT_SCRIM : DARK_SCRIM)

  // Single-amount invariant: one scrim image per frame at one alpha.
  const amount = assertSingleAmount(includes, excludes)

  return {
    active: true,
    amount,
    scrim,
    defaultBg,
    defaultFg,
    includes,
    excludes,
  }
}

/**
 * Assert that all fade markers share a single amount, returning that amount.
 * Mixed amounts currently break the Kitty overlay (one image, one alpha) and
 * have unclear composition semantics (max? source-over compound?). Dev-mode
 * warn and fall back to the first observed amount; production behavior is
 * first-wins but will look wrong.
 */
function assertSingleAmount(includes: FadeRect[], excludes: FadeRect[]): number {
  const all = [...includes, ...excludes]
  const first = all[0]?.amount ?? 0
  if (process.env.NODE_ENV !== "production") {
    for (const r of all) {
      if (Math.abs(r.amount - first) > 1e-6) {
        // eslint-disable-next-line no-console
        console.warn(
          `[silvery:backdrop-fade] multiple fade amounts in one frame (${first} vs ${r.amount}); ` +
            `Kitty overlay will use the first. See buildKittyOverlay / assertSingleAmount.`,
        )
        break
      }
    }
  }
  return Math.max(0, Math.min(1, first))
}

/**
 * Derive the scrim color from the root bg hex.
 *
 * Dark themes scrim toward `#000000`; light themes scrim toward `#ffffff`.
 * Returns `null` when `rootBg` is absent or unparseable — signals legacy
 * single-channel fallback in `fadeCell`.
 */
function deriveScrimColor(rootBg: string | null | undefined): string | null {
  if (!rootBg) return null
  const lum = relativeLuminance(rootBg)
  if (lum === null) return null
  return lum < DARK_LUMINANCE_THRESHOLD ? DARK_SCRIM : LIGHT_SCRIM
}

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
