/**
 * Terminal capability detection.
 *
 * Detects what features the current terminal supports by inspecting
 * environment variables and terminal responses. Each terminal gets a
 * complete capability profile that the rendering pipeline uses to
 * suppress unsupported escape sequences.
 *
 * To add support for a new terminal:
 * 1. Add detection logic (TERM_PROGRAM / TERM check)
 * 2. Set appropriate capabilities
 * 3. Run `runTermtest()` (from inkx) in the terminal to visually verify
 */

export interface TerminalCaps {
  /** Terminal program name (from TERM_PROGRAM) */
  program: string
  /** TERM value */
  term: string
  /** Color support level */
  colorLevel: "none" | "basic" | "256" | "truecolor"
  /** Kitty keyboard protocol supported */
  kittyKeyboard: boolean
  /** Kitty graphics protocol (inline images) */
  kittyGraphics: boolean
  /** Sixel graphics supported */
  sixel: boolean
  /** OSC 52 clipboard */
  osc52: boolean
  /** OSC 8 hyperlinks */
  hyperlinks: boolean
  /** OSC 9/99 notifications */
  notifications: boolean
  /** Bracketed paste mode */
  bracketedPaste: boolean
  /** SGR mouse tracking */
  mouse: boolean
  /** Synchronized output (DEC 2026) */
  syncOutput: boolean
  /** Unicode/emoji support */
  unicode: boolean
  /** SGR 4:x underline style subparameters (curly, dotted, dashed) */
  underlineStyles: boolean
  /** SGR 58 underline color */
  underlineColor: boolean
  /** Text-presentation emoji (⚠, ☑, ⭐) rendered as 2-wide.
   * Modern terminals (Ghostty, iTerm, Kitty) render these at emoji width (2 cells).
   * Terminal.app renders them at text width (1 cell). */
  textEmojiWide: boolean
  /** Heuristic: likely dark background (for theme selection) */
  darkBackground: boolean
  /** Heuristic: likely has Nerd Font installed (for icon selection) */
  nerdfont: boolean
}

import { spawnSync } from "child_process"

/**
 * Check if macOS is in dark mode by reading the system appearance preference.
 * Uses `defaults read -g AppleInterfaceStyle` — returns "Dark" when dark mode
 * is active, exits non-zero when light mode. ~2ms via spawnSync.
 */
function detectMacOSDarkMode(): boolean {
  try {
    const result = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf-8",
      timeout: 500,
    })
    return result.stdout?.trim() === "Dark"
  } catch {
    return false // Default to light if detection fails
  }
}

/** Detect terminal capabilities from environment variables.
 * Synchronous. Minimal I/O: may run `defaults` on macOS for Apple_Terminal.
 */
export function detectTerminalCaps(): TerminalCaps {
  const program = process.env.TERM_PROGRAM ?? ""
  const term = process.env.TERM ?? ""
  const colorTerm = process.env.COLORTERM ?? ""
  const noColor = process.env.NO_COLOR !== undefined

  // Known limited terminals (override COLORTERM which may be inherited)
  const isAppleTerminal = program === "Apple_Terminal"

  // Color level
  let colorLevel: TerminalCaps["colorLevel"] = "none"
  if (!noColor) {
    if (isAppleTerminal) {
      // Terminal.app supports 256 colors but NOT truecolor, regardless of COLORTERM
      colorLevel = "256"
    } else if (colorTerm === "truecolor" || colorTerm === "24bit") {
      colorLevel = "truecolor"
    } else if (term.includes("256color")) {
      colorLevel = "256"
    } else if (process.stdout?.isTTY) {
      colorLevel = "basic"
    }
  }

  // Known terminal capabilities
  const isKitty = term === "xterm-kitty"
  const isITerm = program === "iTerm.app"
  const isGhostty = program === "ghostty"
  const isWezTerm = program === "WezTerm"
  const isAlacritty = program === "Alacritty"
  const isFoot = term === "foot" || term === "foot-extra"
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot

  // Background darkness heuristic (for theme selection)
  // Priority: COLORFGBG env > macOS system appearance > terminal default
  let darkBackground = !isAppleTerminal // Modern terminals default dark
  const colorFgBg = process.env.COLORFGBG
  if (colorFgBg) {
    // COLORFGBG="fg;bg" — bg < 7 typically means dark background
    const parts = colorFgBg.split(";")
    const bg = parseInt(parts[parts.length - 1] ?? "", 10)
    if (!isNaN(bg)) {
      darkBackground = bg < 7 // 0-6 are dark colors, 7+ are light
    }
  } else if (isAppleTerminal) {
    // Terminal.app doesn't set COLORFGBG. Check macOS system appearance
    // to determine if the user is in dark mode (Terminal.app follows system).
    darkBackground = detectMacOSDarkMode()
  }

  // Nerd Font heuristic: modern terminal users likely have Nerd Fonts
  // Terminal.app users typically don't. Override with NERDFONT=0/1.
  let nerdfont = isModern || isAlacritty // Power-user terminals
  const nfEnv = process.env.NERDFONT
  if (nfEnv === "0" || nfEnv === "false") nerdfont = false
  else if (nfEnv === "1" || nfEnv === "true") nerdfont = true

  // SGR underline extensions: modern terminals support SGR 4:x and SGR 58.
  // Terminal.app misparses colon-separated subparameters, corrupting its
  // SGR state machine and producing garbled red/brown artifacts.
  const underlineExtensions = isModern || isAlacritty

  return {
    program,
    term,
    colorLevel,
    kittyKeyboard: isKitty || isGhostty || isWezTerm || isFoot,
    kittyGraphics: isKitty || isGhostty,
    sixel: isFoot || isWezTerm, // Known sixel support
    osc52: isModern || isAlacritty, // Most modern terminals
    hyperlinks: isModern || isAlacritty,
    notifications: isITerm || isKitty, // OSC 9 / OSC 99
    bracketedPaste: true, // Nearly all modern terminals
    mouse: true, // Nearly all modern terminals
    syncOutput: isModern || isAlacritty, // DEC 2026
    unicode: true, // Assume yes for modern terminals
    underlineStyles: underlineExtensions,
    underlineColor: underlineExtensions,
    textEmojiWide: !isAppleTerminal, // Modern terminals render ⚠/☑/⭐ as 2-wide; Terminal.app renders 1-wide
    darkBackground,
    nerdfont,
  }
}
