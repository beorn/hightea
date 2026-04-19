/**
 * TierBar — bottom bar, tier toggle + focus indicator + key legend.
 *
 * Tiers: truecolor (1), 256 (2), ansi16 (3), mono (4). The tier state is
 * owned by App; the bar is a dumb renderer.
 *
 * Visual change per tier comes from the re-derived theme + output-phase
 * quantization. ANSI16 collapses most OKLCH-derived tokens into the nearest
 * 16-color slot — a VERY different look. That's the point.
 */

import React from "react"
import { Box, Text, Muted, Kbd } from "silvery"

export type Tier = "truecolor" | "256" | "ansi16" | "mono"

export const TIER_ORDER: readonly Tier[] = ["truecolor", "256", "ansi16", "mono"]

export const TIER_LABEL: Record<Tier, string> = {
  truecolor: "truecolor",
  "256": "256",
  ansi16: "ansi16",
  mono: "mono",
}

const FOCUS_LABEL: Record<"schemes" | "tokens", string> = {
  schemes: "left · schemes",
  tokens: "right · tokens",
}

export interface TierBarProps {
  tier: Tier
  focus: "schemes" | "tokens"
}

export function TierBar({ tier, focus }: TierBarProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={1}>
        <Muted>tier</Muted>
        {TIER_ORDER.map((t, i) => (
          <React.Fragment key={t}>
            <Text color={t === tier ? "$accent" : undefined} bold={t === tier} inverse={t === tier}>
              {` ${i + 1} ${TIER_LABEL[t]} `}
            </Text>
          </React.Fragment>
        ))}
        <Muted>·</Muted>
        <Muted>focus</Muted>
        <Text color="$info" bold>
          {FOCUS_LABEL[focus]}
        </Text>
      </Box>
      <Box paddingX={1} gap={1} flexWrap="wrap">
        <Muted>
          <Kbd>h/l</Kbd> switch pane
        </Muted>
        <Muted>
          <Kbd>j/k</Kbd> move
        </Muted>
        <Muted>
          <Kbd>J/K</Kbd> ±10
        </Muted>
        <Muted>
          <Kbd>Enter</Kbd> open token
        </Muted>
        <Muted>
          <Kbd>Esc</Kbd> close token
        </Muted>
        <Muted>
          <Kbd>1-4</Kbd> tier
        </Muted>
        <Muted>
          <Kbd>q</Kbd> quit
        </Muted>
      </Box>
    </Box>
  )
}
