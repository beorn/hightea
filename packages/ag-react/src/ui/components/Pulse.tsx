import React, { useState } from "react"
import { Text, type TextProps } from "../../components/Text"
import { useScopeEffect } from "../../hooks/useScopeEffect"

export interface UsePulseOptions {
  /** Pulse interval in milliseconds. Default: 500. */
  intervalMs?: number
  /** Whether the pulse timer is active. Default: true. */
  active?: boolean
  /** Initial visible phase. Default: true. */
  initialOn?: boolean
  /** Override prefers-reduced-motion detection. Default: browser/host media query when available. */
  reducedMotion?: boolean
}

export interface PulseProps extends Omit<TextProps, "children">, UsePulseOptions {
  children?: React.ReactNode
  /** Foreground colors for [on, off] phases. */
  colors?: readonly [TextProps["color"], TextProps["color"]]
}

const DEFAULT_INTERVAL_MS = 500

function prefersReducedMotion(): boolean {
  const globalWithMatchMedia = globalThis as typeof globalThis & {
    matchMedia?: (query: string) => { matches: boolean }
  }
  try {
    return globalWithMatchMedia.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  } catch {
    return false
  }
}

export function usePulse(options: UsePulseOptions = {}): boolean {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    active = true,
    initialOn = true,
    reducedMotion = prefersReducedMotion(),
  } = options
  const [on, setOn] = useState(initialOn)
  const interval = Math.max(1, Math.floor(intervalMs))
  const enabled = active && !reducedMotion

  useScopeEffect(
    (scope) => {
      setOn(initialOn)
      if (!enabled) return
      scope.interval(() => setOn((prev) => !prev), interval, { unref: true })
    },
    [enabled, initialOn, interval],
  )

  return enabled ? on : initialOn
}

export function Pulse({
  children,
  colors,
  intervalMs,
  active,
  initialOn,
  reducedMotion,
  color,
  ...rest
}: PulseProps): React.ReactElement {
  const on = usePulse({ intervalMs, active, initialOn, reducedMotion })
  const phaseColor = colors ? (on ? colors[0] : colors[1]) : color
  return (
    <Text color={phaseColor} {...rest}>
      {children}
    </Text>
  )
}
