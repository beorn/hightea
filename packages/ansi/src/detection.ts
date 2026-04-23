/**
 * Narrow-scope terminal probes.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): the flat 22-field
 * `TerminalCaps` interface split into three layers on
 * {@link ./profile#TerminalProfile}:
 *
 * - {@link TerminalCaps}      — pure protocol flags renderers branch on.
 * - {@link TerminalIdentity}  — environment identity (what terminal IS this).
 * - {@link TerminalHeuristics} — subjective guesses (likely dark background, …).
 *
 * Broader caps/color/unicode/underline detection is owned by {@link ./profile} —
 * import `createTerminalProfile()` (sync) or `probeTerminalProfile()` (async
 * with theme) for the canonical single-source-of-truth entry point. Every
 * TerminalCaps field is resolved there; consumers read `profile.caps.unicode`,
 * `profile.caps.underlineStyles`, `profile.heuristics.textEmojiWide`, etc.
 *
 * Post km-silvery.unicode-plateau Phase 1: `detectUnicode()` and
 * `detectExtendedUnderline()` are retired — their logic moved into
 * {@link ./profile#detectTerminalCapsFromEnv} so the profile is the one and
 * only env reader.
 *
 * Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
 * the `detectColor()` and `detectTerminalCaps()` shims are gone — every
 * call site that asked "what's the color tier?" or "what's the full caps?"
 * now routes through the profile factory instead.
 */

import type { ColorTier, UnderlineStyle } from "./types"

// Forward re-export — profile.ts defines ColorProvenance but caps consumers
// want one import for everything they need.
export type { ColorProvenance } from "./profile"
import type { ColorProvenance } from "./profile"

// =============================================================================
// Cursor Detection — removed unicode-plateau Phase 3.
//
// `detectCursor(stdout)` used to live here. Its "isTTY + !dumb" signal is
// now a TerminalCaps field — callers read `createTerminalProfile({stdout}).caps.cursor`
// or `term.caps.cursor`. This drops the last env read outside the profile
// factory in `@silvery/ansi`.
// =============================================================================

// =============================================================================
// Input Detection — removed unicode-plateau Phase 4.
//
// `detectInput(stdin)` used to live here. Its "stdin.isTTY +
// setRawMode-available" signal now lives on `TerminalCaps.input`, derived
// from the optional `stdin` argument accepted by `createTerminalProfile`.
// Callers with a Term in scope read `term.caps.input`; one-shot callers
// pass `{stdin: process.stdin}` to the profile factory.
// =============================================================================

// =============================================================================
// Color Detection — removed H6 of /big review 2026-04-23.
// Unicode + Extended Underline Detection — removed unicode-plateau Phase 1.
//
// Historic helpers `detectColor(stdout)`, `detectUnicode()`, and
// `detectExtendedUnderline()` used to live here. Every one of them re-read
// `process.env` outside the profile factory, breaking the "one detection,
// one profile" invariant. Call sites now use:
//
//   `createTerminalProfile({ stdout }).colorTier`        // color tier
//   `createTerminalProfile().caps.unicode`               // unicode
//   `createTerminalProfile().caps.underlineStyles`       // extended underline
//
// The profile factory handles the full NO_COLOR > FORCE_COLOR > auto chain,
// the UTF-8 locale / CI / modern-terminal fan-out, and the isModern/isAlacritty
// rules for extended underline — all from a single env read.
// =============================================================================

// =============================================================================
// Terminal Capabilities Profile
// =============================================================================

/**
 * Pure protocol capability flags — what the terminal *can* do at the wire
 * level. Used by renderers / measurer for pre-flight branching.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): the flat 22-field
 * shape was split into {@link TerminalCaps} (protocol flags, this type),
 * {@link TerminalIdentity} (environment identity — program/version/termName),
 * and {@link TerminalHeuristics} (subjective guesses — darkBackground,
 * nerdfont, textEmojiWide). All three live on `profile.{caps,identity,heuristics}`.
 *
 * Renames from the old flat shape:
 * - `colorLevel` → `colorTier` (matches the {@link ColorTier} return type)
 * - `textSizingSupported` → `textSizing` (drops the verbose suffix)
 * - `underlineStyles: boolean` → `underlineStyles: readonly UnderlineStyle[]`
 *   so a terminal that supports curly but not dotted can report that precisely
 * - `colorForced` + `colorProvenance` moved INTO caps (they describe color
 *   resolution, which is caps-adjacent)
 */
export interface TerminalCaps {
  // -------------------------------------------------------------------------
  // IO / screen
  // -------------------------------------------------------------------------

  /** Can the host reposition the cursor? True when the output stream is a
   * TTY and `TERM` is not `"dumb"`. Absorbed from the standalone
   * `detectCursor()` helper in unicode-plateau Phase 3. */
  readonly cursor: boolean
  /** Can the host read raw keystrokes? True when the input stream is a TTY
   * and supports `setRawMode`. Absorbed from the standalone
   * `detectInput()` helper in unicode-plateau Phase 4. */
  readonly input: boolean

  // -------------------------------------------------------------------------
  // Color (gradation)
  // -------------------------------------------------------------------------

  /** Color support tier. See {@link ColorTier}. Renamed from `colorLevel` in
   * Phase 7 to match `hasColor()`'s return type and the usual "tier" parlance. */
  readonly colorTier: ColorTier
  /**
   * Was the color tier forced by env vars (NO_COLOR / FORCE_COLOR) or a
   * caller-supplied `colorOverride`? Equivalent to
   * `colorProvenance === "env" || colorProvenance === "override"` — exposed
   * as a precomputed boolean because that's the question every pre-quantize
   * gate in run.tsx / create-app.tsx actually asks.
   *
   * Moved from {@link ./profile#TerminalProfile} into caps in Phase 7 — it
   * describes *color* resolution, which is caps-adjacent, so grouping it here
   * means all color-tier metadata travels as one unit.
   */
  readonly colorForced: boolean
  /**
   * Which rung of the precedence chain resolved {@link colorTier}. Use
   * {@link colorForced} for the common "was the tier forced?" check; use this
   * enum only when the specific rung matters (e.g. diagnostics, theme
   * detection, debug output).
   */
  readonly colorProvenance: ColorProvenance

  // -------------------------------------------------------------------------
  // Text / unicode
  // -------------------------------------------------------------------------

  /** Unicode/emoji support */
  readonly unicode: boolean
  /**
   * Extended SGR 4:x underline styles this terminal advertises. Empty array
   * means "only the standard SGR 4 single underline is known to work" and
   * consumers should fall back accordingly.
   *
   * Phase 7 upgrade: was a single `boolean` (all-or-nothing). With the array
   * a terminal that supports curly but not dotted can report that precisely;
   * style.ts now checks `caps.underlineStyles.includes("curly")` per style.
   */
  readonly underlineStyles: readonly UnderlineStyle[]
  /** SGR 58 underline color */
  readonly underlineColor: boolean
  /** OSC 66 text sizing protocol likely supported (Kitty 0.40+, Ghostty).
   * Phase 7 rename: dropped the verbose `Supported` suffix. */
  readonly textSizing: boolean

  // -------------------------------------------------------------------------
  // Input protocols
  // -------------------------------------------------------------------------

  /** Kitty keyboard protocol supported */
  readonly kittyKeyboard: boolean
  /** Bracketed paste mode */
  readonly bracketedPaste: boolean
  /** SGR mouse tracking */
  readonly mouse: boolean

  // -------------------------------------------------------------------------
  // Graphics
  // -------------------------------------------------------------------------

  /** Kitty graphics protocol (inline images) */
  readonly kittyGraphics: boolean
  /** Sixel graphics supported */
  readonly sixel: boolean

  // -------------------------------------------------------------------------
  // OSC / control
  // -------------------------------------------------------------------------

  /** OSC 52 clipboard */
  readonly osc52: boolean
  /** OSC 8 hyperlinks */
  readonly hyperlinks: boolean
  /** OSC 9/99 notifications */
  readonly notifications: boolean
  /** Synchronized output (DEC 2026) */
  readonly syncOutput: boolean
}

/**
 * Environment identity — facts about what terminal this IS. Separate from
 * {@link TerminalCaps} because identity doesn't gate rendering; it's what
 * tests, diagnostics, and probe-cache keys discriminate on.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23).
 */
export interface TerminalIdentity {
  /** Terminal program name (from TERM_PROGRAM). */
  readonly program: string
  /** Terminal program version string (from TERM_PROGRAM_VERSION). Empty when
   * the host doesn't advertise a version. Together with `program`, forms the
   * `program@version` fingerprint used as the probe-cache key in
   * `@silvery/ag-term/text-sizing`. See km-silvery.unicode-plateau Phase 2. */
  readonly version: string
  /** TERM env value. Renamed from `term` in Phase 7 to avoid shadowing the
   * ubiquitous `Term` type when consumers destructure `const { term } = ...`. */
  readonly termName: string
}

/**
 * Subjective heuristics — guesses the system made based on env cues. Separate
 * from {@link TerminalCaps} because these aren't protocol facts the renderer
 * can verify; they're hints for theme / icon selection that callers can
 * override without touching hard caps.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23).
 */
export interface TerminalHeuristics {
  /** Heuristic: likely dark background (for theme selection). */
  readonly darkBackground: boolean
  /** Heuristic: likely has Nerd Font installed (for icon selection). */
  readonly nerdfont: boolean
  /** Text-presentation emoji (⚠, ☑, ⭐) rendered as 2-wide.
   * Modern terminals (Ghostty, iTerm, Kitty) render these at emoji width (2 cells).
   * Terminal.app renders them at text width (1 cell). */
  readonly textEmojiWide: boolean
}

/**
 * Default capabilities (assumes modern terminal with full support).
 */
export function defaultCaps(): TerminalCaps {
  return {
    cursor: false,
    input: false,
    colorTier: "truecolor",
    colorForced: false,
    colorProvenance: "auto",
    unicode: true,
    underlineStyles: ["double", "curly", "dotted", "dashed"],
    underlineColor: true,
    textSizing: false,
    kittyKeyboard: false,
    bracketedPaste: true,
    mouse: true,
    kittyGraphics: false,
    sixel: false,
    osc52: false,
    hyperlinks: false,
    notifications: false,
    syncOutput: false,
  }
}

/**
 * Default identity — unknown terminal, unversioned, no TERM set. Matches
 * what a non-TTY Node process sees when run from CI without env vars.
 */
export function defaultIdentity(): TerminalIdentity {
  return {
    program: "",
    version: "",
    termName: "",
  }
}

/**
 * Default heuristics — modern-terminal-ish defaults. Matches the shape that
 * used to be baked into `defaultCaps()` before Phase 7 split identity /
 * heuristics out.
 */
export function defaultHeuristics(): TerminalHeuristics {
  return {
    darkBackground: true,
    nerdfont: false,
    textEmojiWide: true,
  }
}

// `detectTerminalCaps()` was removed in H6 of the /big review 2026-04-23.
// Callers that want a full caps probe now use:
//   `createTerminalProfile().caps`   // sync, env-based auto-detect
//   `await probeTerminalProfile().caps`  // async, bundles theme too
// Both entry points are exported from `@silvery/ansi` and re-exported
// through `@silvery/ag-term` and `@silvery/ag-react`.
