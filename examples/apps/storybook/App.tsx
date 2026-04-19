/**
 * Sterling Storybook — interactive 3-pane design-system explorer.
 *
 * MVP scope (sterling-storybook-mvp):
 *   1. 3-pane layout — SchemeList | ComponentPreview | TokenTree
 *   2. Scheme swap — `h` / `l` (or ←/→) switch focus between panes;
 *      j/k (or ↑/↓) moves cursor in the focused pane; selecting a scheme
 *      re-themes the whole middle pane live via a root <ThemeProvider>.
 *      (Tab is reserved for silvery's system focus manager.)
 *   3. Canonical component set in the middle pane.
 *   4. Collapsible token tree in the right pane — each leaf shows path +
 *      hex swatch + hex value.
 *   5. Token click → DerivationPanel appended under the tree, showing the
 *      rule from theme.derivationTrace.
 *   6. Tier toggle (1/2/3/4) — truecolor, 256, ansi16, mono. ansi16 + mono
 *      are the most visually different.
 *
 * Out of scope (→ sterling-storybook-full):
 *   - Full OKLCH derivation visualizer
 *   - WCAG contrast audit
 *   - Scheme authoring grid
 *   - Intent / urgency demos
 *   - Cross-target preview
 *
 * The storybook is itself a Sterling app: any visual bug here is a Sterling
 * bug.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Box,
  Divider,
  Muted,
  Strong,
  Text,
  ThemeProvider,
  useApp,
  useInput,
  type Key,
} from "silvery"
import { builtinPalettes, sterling, type SterlingTheme } from "@silvery/theme"
import { deriveTheme as legacyDeriveTheme } from "@silvery/ansi"
import type { Theme as LegacyTheme } from "@silvery/ansi"

import { SchemeList } from "./SchemeList.tsx"
import { ComponentPreview } from "./ComponentPreview.tsx"
import { TokenTree, flattenTokens, type FlatTokenEntry } from "./TokenTree.tsx"
import { DerivationPanel } from "./DerivationPanel.tsx"
import { TierBar, TIER_ORDER, type Tier } from "./TierBar.tsx"
import { quantizeLegacyTheme, quantizeSterlingTheme } from "./shared/quantize.ts"

// ────────────────────────────────────────────────────────────────────────────
// Scheme list — sort dark-first, then alpha, for a predictable browser order.
// ────────────────────────────────────────────────────────────────────────────

function orderedSchemes(): string[] {
  const names = Object.keys(builtinPalettes)
  names.sort((a, b) => {
    const sa = builtinPalettes[a as keyof typeof builtinPalettes]
    const sb = builtinPalettes[b as keyof typeof builtinPalettes]
    const da = sa?.dark !== false
    const db = sb?.dark !== false
    if (da !== db) return da ? -1 : 1
    return a.localeCompare(b)
  })
  return names
}

// ────────────────────────────────────────────────────────────────────────────
// Theme builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the legacy Theme that drives the middle pane (<ThemeProvider theme=>).
 * silvery/ui components consume the legacy `primary / accent / success ...`
 * token names today. Sterling lives alongside it and is used for the token
 * tree + derivation panel only.
 */
function buildLegacyTheme(schemeName: string, tier: Tier): LegacyTheme {
  const palette = builtinPalettes[schemeName as keyof typeof builtinPalettes]
  if (!palette) {
    throw new Error(`Unknown scheme: ${schemeName}`)
  }
  // Always derive at truecolor so the theme carries full-precision hex,
  // then preview-quantize to the selected tier below. The output phase
  // would quantize again for a real TTY at tier < truecolor — but our
  // in-process preview bypasses that, so we mirror it here.
  const base = legacyDeriveTheme(palette, "truecolor")
  return quantizeLegacyTheme(base, tier)
}

/**
 * Build the Sterling Theme used by TokenTree + DerivationPanel. Always
 * derived with { trace: true } so the derivation panel has data.
 */
function buildSterlingTheme(schemeName: string): SterlingTheme {
  const palette = builtinPalettes[schemeName as keyof typeof builtinPalettes]
  if (!palette) {
    throw new Error(`Unknown scheme: ${schemeName}`)
  }
  return sterling.deriveFromScheme(palette, { trace: true, contrast: "auto-lift" })
}

// ────────────────────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────────────────────

type Focus = "schemes" | "tokens"

export function App(): React.ReactElement {
  const { exit } = useApp()
  const schemes = useMemo(orderedSchemes, [])
  const [schemeIdx, setSchemeIdx] = useState(0)
  const [tier, setTier] = useState<Tier>("truecolor")
  const [focus, setFocus] = useState<Focus>("schemes")
  const [tokenCursor, setTokenCursor] = useState(0)
  const [openedToken, setOpenedToken] = useState<string | null>(null)

  const schemeName = schemes[schemeIdx]!
  // Base = full-precision truecolor derivation; tier-quantized = what a
  // real terminal would render at the current tier.
  const sterlingThemeBase = useMemo(() => buildSterlingTheme(schemeName), [schemeName])
  const sterlingTheme = useMemo(
    () => quantizeSterlingTheme(sterlingThemeBase, tier),
    [sterlingThemeBase, tier],
  )
  const legacyTheme = useMemo(() => buildLegacyTheme(schemeName, tier), [schemeName, tier])
  const flatTokens: FlatTokenEntry[] = useMemo(() => flattenTokens(sterlingTheme), [sterlingTheme])

  // Clamp the token cursor when the flat list shrinks (shouldn't happen
  // within a single session, but defensive against scheme changes).
  useEffect(() => {
    if (tokenCursor >= flatTokens.length) setTokenCursor(Math.max(0, flatTokens.length - 1))
  }, [flatTokens.length, tokenCursor])

  const stepScheme = useCallback(
    (delta: number) => {
      setSchemeIdx((i) => Math.max(0, Math.min(schemes.length - 1, i + delta)))
      // Close any open token — its hex is stale after scheme swap (the trace
      // step still exists, but feels jumpier to leave open without a resync).
      setOpenedToken(null)
    },
    [schemes.length],
  )

  const stepToken = useCallback(
    (delta: number) => {
      setTokenCursor((i) => Math.max(0, Math.min(flatTokens.length - 1, i + delta)))
    },
    [flatTokens.length],
  )

  useInput((input: string, key: Key) => {
    // Global — always active
    if (input === "q" || (key.ctrl && input === "c")) {
      exit()
      return
    }
    if (input === "1") {
      setTier("truecolor")
      return
    }
    if (input === "2") {
      setTier("256")
      return
    }
    if (input === "3") {
      setTier("ansi16")
      return
    }
    if (input === "4") {
      setTier("mono")
      return
    }
    if (input === "t") {
      const idx = TIER_ORDER.indexOf(tier)
      setTier(TIER_ORDER[(idx + 1) % TIER_ORDER.length]!)
      return
    }
    // `h` / `l` (or left/right arrows) switch panes — we don't use Tab because
    // silvery's focus manager consumes it for system-level focus cycling.
    if (input === "h" || key.leftArrow) {
      setFocus("schemes")
      return
    }
    if (input === "l" || key.rightArrow) {
      setFocus("tokens")
      return
    }
    if (key.escape) {
      if (openedToken) {
        setOpenedToken(null)
        return
      }
      exit()
      return
    }

    // Focused-pane — keyboard directs scheme list or token tree
    if (focus === "schemes") {
      if (input === "j" || key.downArrow) return stepScheme(1)
      if (input === "k" || key.upArrow) return stepScheme(-1)
      if (input === "J") return stepScheme(10)
      if (input === "K") return stepScheme(-10)
      if (input === "g") return setSchemeIdx(0)
      if (input === "G") return setSchemeIdx(schemes.length - 1)
    } else {
      if (input === "j" || key.downArrow) return stepToken(1)
      if (input === "k" || key.upArrow) return stepToken(-1)
      if (input === "J") return stepToken(10)
      if (input === "K") return stepToken(-10)
      if (input === "g") return setTokenCursor(0)
      if (input === "G") return setTokenCursor(flatTokens.length - 1)
      if (key.return) {
        const t = flatTokens[tokenCursor]
        if (t) setOpenedToken(t.path)
        return
      }
    }
  })

  const header = (
    <Box paddingX={1} gap={1}>
      <Text dim color="$accent">
        ▸ silvery
      </Text>
      <Strong>Sterling Storybook</Strong>
      <Muted>— interactive design-system explorer</Muted>
      <Muted>·</Muted>
      <Text bold color="$accent">
        {schemeName}
      </Text>
      <Muted>({sterlingTheme.mode})</Muted>
    </Box>
  )

  // Wrap the middle pane in a ThemeProvider for the active scheme + tier. The
  // left + right panes intentionally also re-theme (they're part of the same
  // storybook surface) — consistent look, one root theme.
  return (
    <ThemeProvider theme={legacyTheme}>
      <Box flexDirection="column" height="100%" padding={0}>
        {header}
        <Divider />
        <Box flexGrow={1} flexDirection="row" gap={0} overflow="hidden">
          <SchemeList
            schemes={schemes}
            selectedIndex={schemeIdx}
            onSelect={setSchemeIdx}
            focused={focus === "schemes"}
          />
          <ComponentPreview schemeName={schemeName} mode={sterlingTheme.mode} />
          <Box flexDirection="column">
            <TokenTree
              theme={sterlingTheme}
              cursorIndex={tokenCursor}
              openedPath={openedToken}
              focused={focus === "tokens"}
            />
            <DerivationPanel theme={sterlingThemeBase} openedPath={openedToken} tier={tier} />
          </Box>
        </Box>
        <Divider />
        <TierBar tier={tier} focus={focus} />
      </Box>
    </ThemeProvider>
  )
}
