/**
 * Terminal palette auto-detection via OSC queries.
 *
 * Enhanced version with named palette fallbacks (Nord dark, Catppuccin Latte light).
 * The base implementation lives in @silvery/ansi — this adds richer defaults.
 *
 * @silvery/theme consumers: import from here for named palette fallbacks.
 * Standalone consumers: import from @silvery/ansi for lightweight defaults.
 */

import type { ColorPalette, Theme } from "./types"
import { deriveTheme } from "./derive"
import {
  detectTerminalPalette as _detectTerminalPalette,
  queryMultiplePaletteColors,
  parsePaletteResponse,
  queryForegroundColor,
  queryBackgroundColor,
  ansi16DarkTheme,
  ansi16LightTheme,
} from "@silvery/ansi"
import type { DetectedPalette } from "@silvery/ansi"
import { nord } from "./palettes/nord"
import { catppuccinLatte } from "./palettes/catppuccin"

// Re-export the base detection — works standalone without named palettes
export { _detectTerminalPalette as detectTerminalPalette }
export type { DetectedPalette }

// ============================================================================
// detectTheme — high-level: detect terminal palette, fill gaps, derive theme
// ============================================================================

export interface DetectThemeOptions {
  /** Fallback ColorPalette when detection fails or returns partial data.
   * Detected colors override matching fallback fields. */
  fallback?: ColorPalette
  /** Timeout per OSC query in ms (default 150). */
  timeoutMs?: number
  /** Terminal capabilities (from detectTerminalCaps). When provided:
   * - colorLevel "none"/"basic" skips OSC detection and returns ANSI 16 theme
   * - darkBackground informs fallback selection when detection fails */
  caps?: { colorLevel?: string; darkBackground?: boolean }
}

/**
 * Detect the terminal's color palette and derive a Theme.
 *
 * Enhanced version that uses Nord (dark) or Catppuccin Latte (light)
 * as fallback palettes for richer defaults than the base @silvery/ansi version.
 */
export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const colorLevel = opts.caps?.colorLevel
  if (colorLevel === "none" || colorLevel === "basic") {
    const isDark = opts.caps?.darkBackground ?? true
    return isDark ? ansi16DarkTheme : ansi16LightTheme
  }

  const detected = await _detectTerminalPalette(opts.timeoutMs)
  const isDark = detected?.dark ?? opts.caps?.darkBackground ?? true
  const fallback = opts.fallback ?? (isDark ? nord : catppuccinLatte)

  if (!detected) {
    return deriveTheme(fallback)
  }

  const merged: ColorPalette = { ...fallback, ...stripNulls(detected.palette) }
  return deriveTheme(merged)
}

function stripNulls(partial: Partial<ColorPalette>): Partial<ColorPalette> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(partial)) {
    if (v != null) result[k] = v
  }
  return result as Partial<ColorPalette>
}
