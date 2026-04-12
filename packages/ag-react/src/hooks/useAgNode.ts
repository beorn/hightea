/**
 * useAgNode — access the current component's AgNode and its reactive signals.
 *
 * Returns the AgNode and its rect signals (boxRect, scrollRect, screenRect).
 * Signals are alien-signals writable functions — call with no args to read.
 * Use inside an `effect()` from `@silvery/signals` for reactive subscriptions.
 *
 * Returns null if called outside a silvery component tree.
 */

import { useContext } from "react"
import { NodeContext } from "../context"
import { getRectSignals, type RectSignals } from "@silvery/ag/rect-signals"
import type { AgNode } from "@silvery/ag/types"

export interface AgNodeHandle {
  /** The underlying AgNode */
  readonly node: AgNode
  /** Reactive rect signals — call signal() to read current value */
  readonly signals: RectSignals
}

export function useAgNode(): AgNodeHandle | null {
  const node = useContext(NodeContext)
  if (!node) return null
  const signals = getRectSignals(node)
  return { node, signals }
}
