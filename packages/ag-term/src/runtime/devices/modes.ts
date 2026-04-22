/**
 * term.modes — single owner for terminal protocol modes.
 *
 * Consolidates the previously-scattered enable/disable calls for:
 *   - raw mode (stdin termios)
 *   - alternate screen buffer (DEC private mode 1049)
 *   - bracketed paste (DEC private mode 2004)
 *   - Kitty keyboard protocol (CSI > flags u / CSI < u)
 *   - mouse tracking (modes 1003 + 1006)
 *   - focus reporting (DEC private mode 1004)
 *
 * ## Why
 *
 * Terminal protocol modes are *shared global state*. The historical pattern —
 * every subsystem (probe, runtime, provider) calls `enableX()` / `disableX()`
 * independently — produces the same race class that killed raw mode in the
 * 2026-04-22 `wasRaw` incident: multi-tenant toggling of global termios/
 * terminal state across async boundaries.
 *
 * ## Ownership contract
 *
 * One `Modes` instance per Term. Construction is cheap — no ANSI is emitted
 * until `set*` is called. Callers set modes ONCE at session start and restore
 * them ONCE on dispose. Mid-session re-toggling is permitted (e.g. suspend/
 * resume flows need to drop protocols before SIGTSTP), but MUST go through
 * the owner so state stays consistent.
 *
 * State getters (`isRawMode`, `isMouseEnabled`, etc.) reflect the last value
 * *this owner* wrote. They are the app's source of truth — the terminal has
 * no query-for-current-mode protocol for most of these.
 *
 * ## Dispose
 *
 * Restores every mode this owner activated (ignores modes the owner never
 * touched — setting `rawMode=false` when we never enabled raw would be wrong
 * on a shared stdin). Idempotent.
 *
 * Bead: km-silvery.term-sub-owners (Phase 4).
 */

import {
  enableMouse,
  disableMouse,
  enableKittyKeyboard,
  disableKittyKeyboard,
  enableBracketedPaste,
  disableBracketedPaste,
} from "@silvery/ansi"

const CSI = "\x1b["

/** DEC private mode 1004: focus-in / focus-out reporting. */
const ENABLE_FOCUS_REPORTING = `${CSI}?1004h`
const DISABLE_FOCUS_REPORTING = `${CSI}?1004l`

/** DEC private mode 1049: alternate screen buffer (save + switch). */
const ENTER_ALT_SCREEN = `${CSI}?1049h`
const LEAVE_ALT_SCREEN = `${CSI}?1049l`

/**
 * Kitty keyboard protocol flags (bitfield).
 *
 * | Flag | Bit | Description                               |
 * | ---- | --- | ----------------------------------------- |
 * | 1    | 0   | Disambiguate escape codes                 |
 * | 2    | 1   | Report event types (press/repeat/release) |
 * | 4    | 2   | Report alternate keys                     |
 * | 8    | 3   | Report all keys as escape codes           |
 * | 16   | 4   | Report associated text                    |
 */
export const KittyFlags = {
  DISAMBIGUATE: 1,
  REPORT_EVENTS: 2,
  REPORT_ALTERNATE: 4,
  REPORT_ALL_KEYS: 8,
  REPORT_TEXT: 16,
} as const

/**
 * Terminal protocol modes sub-owner.
 *
 * Owns ALL protocol-mode ANSI sequences for one Term's lifetime. Tracks the
 * last-set value for each mode so `dispose()` can restore exactly what was
 * activated (not a global reset that could stomp on a neighbouring session).
 */
export interface Modes extends Disposable {
  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  /**
   * Set stdin raw mode. Idempotent — a repeat call with the same value is a
   * no-op. Safe to call on a non-TTY stdin (becomes a no-op).
   *
   * wasRaw note: prefer a single `setRawMode(true)` at session start; do not
   * capture-and-restore around async work. See
   * `vendor/silvery/CLAUDE.md` "Anti-pattern: wasRaw".
   */
  setRawMode(on: boolean): void

  /** Enter or leave the alternate screen buffer (DEC 1049). */
  setAlternateScreen(on: boolean): void

  /** Enable or disable bracketed paste (DEC 2004). */
  setBracketedPaste(on: boolean): void

  /**
   * Enable or disable Kitty keyboard protocol.
   * Pass a flags bitfield (see `KittyFlags`) to enable; pass `false` to
   * disable. `true` enables with `KittyFlags.DISAMBIGUATE` only — use a
   * numeric bitfield for richer modes.
   */
  setKittyKeyboard(flags: number | false): void

  /**
   * Enable or disable SGR mouse tracking (xterm modes 1003 + 1006).
   * 1003 = all motion + clicks (hover supported). 1006 = SGR encoding.
   */
  setMouseEnabled(on: boolean): void

  /** Enable or disable focus-in / focus-out reporting (DEC 1004). */
  setFocusReporting(on: boolean): void

  // ---------------------------------------------------------------------------
  // State (reflects the last value this owner wrote)
  // ---------------------------------------------------------------------------

  readonly isRawMode: boolean
  readonly isAlternateScreen: boolean
  readonly isBracketedPaste: boolean
  /** Current Kitty flags bitfield, or `false` if disabled. */
  readonly kittyKeyboard: number | false
  readonly isMouseEnabled: boolean
  readonly isFocusReporting: boolean
}

/**
 * Options for `createModes()`.
 *
 * The owner needs:
 * - a write function for ANSI sequences (routes through OutputGuard if
 *   installed, else bare `stdout.write`)
 * - the stdin stream (for `setRawMode` — termios toggle, not ANSI)
 */
export interface CreateModesOptions {
  /** Write raw ANSI bytes to stdout. */
  write: (data: string) => void
  /** stdin stream — used only for raw-mode termios toggles. */
  stdin: NodeJS.ReadStream
}

/**
 * Create a `Modes` sub-owner. Does not emit any ANSI at construction — all
 * sequences are written lazily on the first `set*` call.
 */
export function createModes(opts: CreateModesOptions): Modes {
  const { write, stdin } = opts

  let rawMode = false
  let alternateScreen = false
  let bracketedPaste = false
  let kittyKeyboard: number | false = false
  let mouseEnabled = false
  let focusReporting = false
  let disposed = false

  const setRawMode: Modes["setRawMode"] = (on) => {
    if (disposed) return
    if (rawMode === on) return
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(on)
      } catch {
        // stdin may be closed mid-call — ignore, state tracked below
      }
    }
    rawMode = on
  }

  const setAlternateScreen: Modes["setAlternateScreen"] = (on) => {
    if (disposed) return
    if (alternateScreen === on) return
    write(on ? ENTER_ALT_SCREEN : LEAVE_ALT_SCREEN)
    alternateScreen = on
  }

  const setBracketedPaste: Modes["setBracketedPaste"] = (on) => {
    if (disposed) return
    if (bracketedPaste === on) return
    write(on ? enableBracketedPaste() : disableBracketedPaste())
    bracketedPaste = on
  }

  const setKittyKeyboard: Modes["setKittyKeyboard"] = (flags) => {
    if (disposed) return
    const want = flags === true ? KittyFlags.DISAMBIGUATE : flags
    if (kittyKeyboard === want) return
    if (want === false) {
      write(disableKittyKeyboard())
    } else {
      write(enableKittyKeyboard(want))
    }
    kittyKeyboard = want
  }

  const setMouseEnabled: Modes["setMouseEnabled"] = (on) => {
    if (disposed) return
    if (mouseEnabled === on) return
    write(on ? enableMouse() : disableMouse())
    mouseEnabled = on
  }

  const setFocusReporting: Modes["setFocusReporting"] = (on) => {
    if (disposed) return
    if (focusReporting === on) return
    write(on ? ENABLE_FOCUS_REPORTING : DISABLE_FOCUS_REPORTING)
    focusReporting = on
  }

  const dispose = () => {
    if (disposed) return
    disposed = true

    // Restore ONLY what this owner activated. Order matters: drop protocols
    // first (so the terminal stops sending their events), then leave the alt
    // screen, then drop raw. Mirrors the order of `restoreTerminalState()`
    // in terminal-lifecycle.ts.
    const sequences: string[] = []
    if (focusReporting) sequences.push(DISABLE_FOCUS_REPORTING)
    if (mouseEnabled) sequences.push(disableMouse())
    if (kittyKeyboard !== false) sequences.push(disableKittyKeyboard())
    if (bracketedPaste) sequences.push(disableBracketedPaste())
    if (alternateScreen) sequences.push(LEAVE_ALT_SCREEN)
    if (sequences.length > 0) {
      try {
        write(sequences.join(""))
      } catch {
        // Terminal may already be gone (SSH disconnect, etc.)
      }
    }

    if (rawMode && stdin.isTTY) {
      try {
        stdin.setRawMode(false)
      } catch {
        // stdin may be closed
      }
    }

    focusReporting = false
    mouseEnabled = false
    kittyKeyboard = false
    bracketedPaste = false
    alternateScreen = false
    rawMode = false
  }

  return {
    setRawMode,
    setAlternateScreen,
    setBracketedPaste,
    setKittyKeyboard,
    setMouseEnabled,
    setFocusReporting,
    get isRawMode() {
      return rawMode
    },
    get isAlternateScreen() {
      return alternateScreen
    },
    get isBracketedPaste() {
      return bracketedPaste
    },
    get kittyKeyboard() {
      return kittyKeyboard
    },
    get isMouseEnabled() {
      return mouseEnabled
    },
    get isFocusReporting() {
      return focusReporting
    },
    [Symbol.dispose]: dispose,
  }
}
