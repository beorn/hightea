/**
 * TokenChip — displays a single design token as a clickable row.
 *
 * Layout: swatch + label + (hex). Highlighted when cursor is on this token.
 * Used by TokenTree in the right pane.
 */

import React from "react"
import { Box, Text, Muted } from "silvery"

export interface TokenChipProps {
  /** Nested path, e.g. "accent.hover.bg". Used as the unique id. */
  path: string
  /** User-facing short label (e.g. "bg" or "hover.bg"). */
  label: string
  /** Hex value — drives the swatch color. */
  hex: string
  /** Width reserved for the label column, in cells. */
  labelWidth?: number
  /** Whether this chip is currently cursor-highlighted. */
  selected?: boolean
  /** Whether this chip is the currently-clicked/opened one (derivation panel target). */
  opened?: boolean
}

/**
 * A fixed-width, single-row representation of one token leaf.
 * Swatch uses the hex as a hard-coded color — this is intentional: the swatch
 * DISPLAYS the token; it doesn't READ a $token. Every other color comes from
 * the theme.
 */
export function TokenChip({
  label,
  hex,
  labelWidth = 14,
  selected = false,
  opened = false,
}: TokenChipProps): React.ReactElement {
  const padded = label.length < labelWidth ? label + " ".repeat(labelWidth - label.length) : label
  const marker = opened ? "●" : selected ? "▸" : " "
  return (
    <Box gap={1}>
      <Text color={selected || opened ? "$fg-accent" : "$fg-muted"}>{marker}</Text>
      <Text color={hex}>██</Text>
      <Text color={selected || opened ? "$fg-accent" : undefined} bold={selected || opened}>
        {padded}
      </Text>
      <Muted>{hex}</Muted>
    </Box>
  )
}
