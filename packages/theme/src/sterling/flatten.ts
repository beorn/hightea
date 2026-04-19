/**
 * Sterling flatten — writes flat hyphen-key projections onto the same object
 * as the nested role form. Per D4: no Proxy. Same string reference at both
 * paths. Freeze at end.
 *
 * Flattening rule (deterministic):
 *   theme.{role}.{kind}            → {kind}-{role}
 *   theme.{role}.{kind}.{state}    → {kind}-{role}-{state}
 *   theme.{role}.{state}.{kind}    → {kind}-{role}-{state}      (same)
 *   theme.{role}.fgOn              → fg-on-{role}
 *
 * Plus a few specials:
 *   theme.surface.{level}          → bg-surface-{level}
 *   theme.border.{kind}            → border-{kind}
 *   theme.cursor.{kind}            → {kind}-cursor
 *   theme.muted.{kind}             → {kind}-muted
 *   theme.accent.border            → border-accent
 */

import type { Theme, FlatToken } from "./types.ts"

const INTERACTIVE_ROLES = ["accent", "info", "success", "warning", "error"] as const
const STATES = ["hover", "active"] as const

/**
 * Populate flat keys onto `theme` in-place. Returns the same object, frozen.
 *
 * The input should be the nested form (Omit<Theme, keyof FlatTokens>).
 * After this runs, the object is a full Theme (FlatTokens & Roles).
 */
export function populateFlat(theme: any): Theme {
  for (const role of INTERACTIVE_ROLES) {
    const r = theme[role]
    if (!r) continue
    theme[`fg-${role}`] = r.fg
    theme[`bg-${role}`] = r.bg
    theme[`fg-on-${role}`] = r.fgOn
    for (const state of STATES) {
      const s = r[state]
      if (!s) continue
      theme[`fg-${role}-${state}`] = s.fg
      theme[`bg-${role}-${state}`] = s.bg
    }
  }

  // Accent's border
  if (theme.accent?.border) {
    theme["border-accent"] = theme.accent.border
  }

  // Surface
  const surf = theme.surface
  if (surf) {
    theme["bg-surface-default"] = surf.default
    theme["bg-surface-subtle"] = surf.subtle
    theme["bg-surface-raised"] = surf.raised
    theme["bg-surface-overlay"] = surf.overlay
    theme["bg-surface-hover"] = surf.hover
  }

  // Border
  const b = theme.border
  if (b) {
    theme["border-default"] = b.default
    theme["border-focus"] = b.focus
    theme["border-muted"] = b.muted
  }

  // Cursor
  const c = theme.cursor
  if (c) {
    theme["fg-cursor"] = c.fg
    theme["bg-cursor"] = c.bg
  }

  // Muted
  const m = theme.muted
  if (m) {
    theme["fg-muted"] = m.fg
    theme["bg-muted"] = m.bg
  }

  // Freeze: make immutability explicit. We also freeze the nested role
  // objects so `theme.accent.hover.bg = "..."` fails loudly.
  freezeDeep(theme)
  return theme as Theme
}

function freezeDeep(o: any): void {
  if (o === null || typeof o !== "object") return
  Object.freeze(o)
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v && typeof v === "object" && !Object.isFrozen(v)) freezeDeep(v)
  }
}

/** The complete list of FlatToken strings Sterling emits. Mirrors the type in `types.ts`. */
export const STERLING_FLAT_TOKENS: readonly FlatToken[] = [
  // Surface
  "bg-surface-default",
  "bg-surface-subtle",
  "bg-surface-raised",
  "bg-surface-overlay",
  "bg-surface-hover",
  // Border
  "border-default",
  "border-focus",
  "border-muted",
  // Cursor
  "fg-cursor",
  "bg-cursor",
  // Muted
  "fg-muted",
  "bg-muted",
  // Accent
  "fg-accent",
  "bg-accent",
  "fg-on-accent",
  "fg-accent-hover",
  "bg-accent-hover",
  "fg-accent-active",
  "bg-accent-active",
  "border-accent",
  // Info
  "fg-info",
  "bg-info",
  "fg-on-info",
  "fg-info-hover",
  "bg-info-hover",
  "fg-info-active",
  "bg-info-active",
  // Success
  "fg-success",
  "bg-success",
  "fg-on-success",
  "fg-success-hover",
  "bg-success-hover",
  "fg-success-active",
  "bg-success-active",
  // Warning
  "fg-warning",
  "bg-warning",
  "fg-on-warning",
  "fg-warning-hover",
  "bg-warning-hover",
  "fg-warning-active",
  "bg-warning-active",
  // Error
  "fg-error",
  "bg-error",
  "fg-on-error",
  "fg-error-hover",
  "bg-error-hover",
  "fg-error-active",
  "bg-error-active",
]
