/**
 * ANSI 16 theme generation — derives a complete Theme from a primary color + dark/light.
 *
 * Uses ANSI color names (not hex) so it works on any terminal without truecolor support.
 */

import type { AnsiPrimary, Theme } from "./types"

/**
 * Generate a complete ANSI 16 theme from a primary color + dark/light preference.
 *
 * All token values are ANSI color names (e.g. "yellow", "blueBright").
 */
export function generateTheme(primary: AnsiPrimary, dark: boolean): Theme {
  return {
    name: `${dark ? "dark" : "light"}-${primary}`,

    // ── Root pair ─────────────────────────────────────────────────
    bg: "",
    fg: dark ? "whiteBright" : "black",

    // ── Surface pairs (base = text, *bg = background) ──────────
    muted: dark ? "white" : "blackBright",
    mutedbg: dark ? "black" : "white",
    surface: dark ? "whiteBright" : "black",
    surfacebg: dark ? "black" : "white",
    popover: dark ? "whiteBright" : "black",
    popoverbg: dark ? "black" : "white",
    inverse: dark ? "black" : "whiteBright",
    inversebg: dark ? "whiteBright" : "black",
    cursor: "black",
    cursorbg: primary,
    selection: "black",
    selectionbg: primary,

    // ── Accent pairs (base = area bg, *fg = text on area) ──────
    primary,
    primaryfg: "black",
    secondary: primary,
    secondaryfg: "black",
    accent: primary,
    accentfg: "black",
    error: dark ? "redBright" : "red",
    errorfg: "black",
    warning: primary,
    warningfg: "black",
    success: dark ? "greenBright" : "green",
    successfg: "black",
    info: dark ? "cyanBright" : "cyan",
    infofg: "black",

    // ── Standalone ───────────────────────────────────────────────
    border: "gray",
    inputborder: "gray",
    focusborder: dark ? "blueBright" : "blue",
    link: "blueBright",
    disabledfg: "gray",

    // ── Palette ──────────────────────────────────────────────────
    palette: [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "blackBright",
      "redBright",
      "greenBright",
      "yellowBright",
      "blueBright",
      "magentaBright",
      "cyanBright",
      "whiteBright",
    ],
  }
}
