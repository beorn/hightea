/**
 * DerivationPanel — inline panel surfaced below the TokenTree when a token
 * is opened (Enter).
 *
 * Shows: nested path, flat key, hex swatch, derivation rule, input hexes.
 * The rule comes from theme.derivationTrace (Sterling attaches it when the
 * derivation is called with `{ trace: true }`).
 *
 * MVP scope: the rule + inputs as captured by Sterling. The full OKLCH-math
 * visualizer is deferred to the Full storybook.
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, Divider, Strong, Small } from "silvery"
import type { SterlingTheme, SterlingDerivationStep } from "@silvery/theme"
import { quantizeHex, type ColorTier } from "@silvery/ansi"

/** Convert a nested path like "accent.hover.bg" → flat "bg-accent-hover". */
export function nestedToFlat(path: string): string {
  const parts = path.split(".")
  // shape cases:
  //   role.fg / role.bg / role.fgOn / role.border
  //   role.hover.fg / role.hover.bg / role.active.fg / role.active.bg
  //   surface.default / surface.subtle / ...
  //   border.default / border.focus / ...
  //   cursor.fg / cursor.bg
  if (parts.length === 2) {
    const [role, kind] = parts
    if (kind === "fgOn") return `fg-on-${role}`
    if (role === "surface") return `bg-surface-${kind}`
    if (role === "border") return `border-${kind}`
    if (role === "cursor") return `${kind}-cursor`
    if (role === "muted") return `${kind}-muted`
    if (kind === "border") return `border-${role}`
    return `${kind}-${role}`
  }
  if (parts.length === 3) {
    const [role, state, kind] = parts
    return `${kind}-${role}-${state}`
  }
  return path
}

export interface DerivationPanelProps {
  theme: SterlingTheme
  openedPath: string | null
  /**
   * Active preview tier. When provided and != "truecolor", the panel shows
   * both the derived truecolor hex (full precision) AND the quantized hex
   * a terminal at this tier would actually emit.
   */
  tier?: ColorTier
}

export function DerivationPanel({
  theme,
  openedPath,
  tier = "truecolor",
}: DerivationPanelProps): React.ReactElement | null {
  const step: SterlingDerivationStep | null = useMemo(() => {
    if (!openedPath) return null
    const trace = theme.derivationTrace ?? []
    return trace.find((s) => s.token === openedPath) ?? null
  }, [openedPath, theme])

  if (!openedPath) return null

  const flat = nestedToFlat(openedPath)
  const hex = step?.output ?? "(unknown)"
  const isKnown = hex !== "(unknown)"
  const quantized = isKnown && tier !== "truecolor" ? quantizeHex(hex, tier) : null

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="$accent"
      paddingX={1}
      marginTop={0}
    >
      <Box gap={1}>
        <Text color="$accent" bold>
          ▼
        </Text>
        <Strong>Derivation</Strong>
      </Box>
      <Divider />
      <Box flexDirection="column" gap={0}>
        <Box gap={1}>
          <Muted>nested</Muted>
          <Text bold>{openedPath}</Text>
        </Box>
        <Box gap={1}>
          <Muted>flat</Muted>
          <Text>${flat}</Text>
        </Box>
        <Box gap={1}>
          <Muted>hex</Muted>
          <Text color={hex}>██</Text>
          <Text bold>{hex}</Text>
        </Box>
        {quantized ? (
          <Box gap={1}>
            <Muted>@{tier}</Muted>
            <Text color={quantized}>██</Text>
            <Text bold color="$warning">
              {quantized}
            </Text>
          </Box>
        ) : null}
        {step ? (
          <>
            <Box gap={1}>
              <Muted>rule</Muted>
              <Text color="$info">{step.rule}</Text>
            </Box>
            {step.inputs.length > 0 ? (
              <Box gap={1} flexWrap="wrap">
                <Muted>inputs</Muted>
                {step.inputs.map((inp, i) => (
                  <Box key={i} gap={0}>
                    <Text color={inp}>██</Text>
                    <Muted>{inp}</Muted>
                  </Box>
                ))}
              </Box>
            ) : null}
            {step.liftedFrom ? (
              <Box gap={1}>
                <Muted>auto-lifted from</Muted>
                <Text color={step.liftedFrom}>██</Text>
                <Muted>{step.liftedFrom}</Muted>
              </Box>
            ) : null}
            {step.pinned ? (
              <Small>
                <Muted>pinned by scheme author</Muted>
              </Small>
            ) : null}
          </>
        ) : (
          <Small>
            <Muted>(no derivation trace — enable via {"{ trace: true }"})</Muted>
          </Small>
        )}
      </Box>
    </Box>
  )
}
