/**
 * Badge Component
 *
 * A small inline label for status display.
 *
 * Tone surface (Sterling Phase 2b):
 *   - `error` | `warning` | `success` | `info` — status tones (what's happening)
 *   - `accent` — emphasis / brand (preferred over legacy `primary`)
 *   - `destructive` — intent alias for `error` (semantic correctness without
 *     palette sprawl; see design-system.md §"Intent vs role")
 *   - `primary` — legacy synonym for `accent`, accepted during Phase 2b/2c
 *   - `default` — base foreground
 *
 * Usage:
 * ```tsx
 * <Badge label="Active" tone="success" />
 * <Badge label="Delete" tone="destructive" />
 * <Badge label="New" tone="accent" />
 * <Badge label="Custom" color="magenta" />
 * ```
 */
import React from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

/**
 * Tone values — Sterling statuses plus the `destructive` intent alias.
 * `primary` stays as a legacy synonym for `accent` while km-tui finishes
 * migrating; it resolves to the same Sterling token.
 */
export type BadgeTone =
  | "default"
  | "accent"
  | "error"
  | "warning"
  | "success"
  | "info"
  | "destructive"
  | "primary"

export interface BadgeProps extends Omit<TextProps, "children"> {
  /** Badge text */
  label: string
  /**
   * Sterling tone. Accepts status roles (`error`/`warning`/`success`/`info`),
   * the accent emphasis role, or the `destructive` intent alias. Legacy
   * `primary` stays as a synonym during Phase 2b/2c.
   */
  tone?: BadgeTone
  /** Legacy alias for `tone`. Prefer `tone`. */
  variant?: BadgeTone
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Tone → Sterling flat token mapping. `destructive` aliases to `error` per
 * D1 (intent lives at the component layer, not as a Theme field).
 */
const TONE_COLORS: Record<BadgeTone, string> = {
  default: "$fg",
  accent: "$fg-accent",
  primary: "$fg-accent",
  error: "$fg-error",
  destructive: "$fg-error",
  warning: "$fg-warning",
  success: "$fg-success",
  info: "$fg-info",
}

// =============================================================================
// Component
// =============================================================================

export function Badge({ label, tone, variant, color, ...rest }: BadgeProps): React.ReactElement {
  // `tone` wins over legacy `variant` when both are set.
  const effectiveTone: BadgeTone = tone ?? variant ?? "default"
  const resolvedColor = color ?? TONE_COLORS[effectiveTone]

  return (
    <Text color={resolvedColor} bold {...rest}>
      {" "}
      {label}{" "}
    </Text>
  )
}
