/**
 * useBoxMetrics — Ink-compatible box metrics hook.
 *
 * Returns layout metrics ({ width, height, left, top, hasMeasured }) for the
 * nearest silvery Box. Matches Ink 7.0's `useBoxMetrics(ref)` signature for
 * drop-in compatibility, while also supporting silvery's NodeContext idiom
 * when called without a ref.
 *
 * Semantics:
 * - `left` / `top` are **parent-relative** (contentRect.x − parent.contentRect.x)
 *   to match Ink's `getComputedLayout()` semantics.
 * - `hasMeasured` is `false` before layout runs and `true` after — useful for
 *   rendering loading states on first frame.
 * - Pre-measure: returns zeros (all fields 0, `hasMeasured: false`).
 *
 * @example Ink-compatible (ref-based)
 * ```tsx
 * import { useRef } from "react"
 * import { Box, Text, useBoxMetrics } from "silvery"
 *
 * function MyBox() {
 *   const ref = useRef(null)
 *   const { width, height, hasMeasured } = useBoxMetrics(ref)
 *   return (
 *     <Box ref={ref}>
 *       <Text>{hasMeasured ? `${width}x${height}` : "measuring..."}</Text>
 *     </Box>
 *   )
 * }
 * ```
 *
 * @example Silvery idiom (context-based, no ref)
 * ```tsx
 * import { Box, Text, useBoxMetrics } from "silvery"
 *
 * function Header() {
 *   const { width } = useBoxMetrics()
 *   return <Text>{"=".repeat(width)}</Text>
 * }
 * ```
 */

import { useContext, useLayoutEffect, useReducer, type RefObject } from "react"
import { NodeContext } from "../context"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Types
// ============================================================================

/**
 * Box layout metrics. Matches Ink 7.0's `BoxMetrics` shape.
 */
export interface BoxMetrics {
  /** Width of the box's content rect */
  readonly width: number
  /** Height of the box's content rect */
  readonly height: number
  /** Parent-relative X offset (left) */
  readonly left: number
  /** Parent-relative Y offset (top) */
  readonly top: number
  /** `false` before first layout, `true` once measured */
  readonly hasMeasured: boolean
}

// ============================================================================
// Internals
// ============================================================================

const EMPTY_METRICS: BoxMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0,
  hasMeasured: false,
}

/**
 * Extract an AgNode from a ref value that may be either a `BoxHandle`
 * (from `Box`'s `forwardRef`) or a direct `AgNode`.
 */
function resolveNode(refValue: unknown): AgNode | null {
  if (!refValue || typeof refValue !== "object") return null
  const obj = refValue as Record<string, unknown>
  // BoxHandle (has getNode() method)
  if (typeof obj.getNode === "function") {
    const node = (obj.getNode as () => AgNode | null)()
    return node ?? null
  }
  // Direct AgNode (has layoutSubscribers)
  if ("layoutSubscribers" in obj) {
    return refValue as AgNode
  }
  return null
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns the layout metrics for a silvery Box.
 *
 * With a ref: metrics for the referenced Box (Ink-compatible path).
 * Without a ref: metrics for the nearest enclosing Box via NodeContext
 * (silvery idiom — no ref plumbing required).
 *
 * Re-renders when the box's contentRect changes (subscribes via
 * `node.layoutSubscribers`). Cleans up on unmount or when the target node
 * changes.
 */
export function useBoxMetrics(ref?: RefObject<unknown>): BoxMetrics {
  const contextNode = useContext(NodeContext)
  const resolved = ref ? resolveNode(ref.current) : contextNode
  const node: AgNode | null = resolved ?? null

  // Force-update on layout change — we read values from the node directly
  // in the render body so no React state is needed for the values themselves.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useLayoutEffect(() => {
    if (!node) return
    const onLayout = () => forceUpdate()
    node.layoutSubscribers.add(onLayout)
    return () => {
      node.layoutSubscribers.delete(onLayout)
    }
  }, [node])

  if (!node || !node.contentRect) return EMPTY_METRICS

  const rect = node.contentRect
  const parentRect = node.parent?.contentRect ?? null
  return {
    width: rect.width,
    height: rect.height,
    left: parentRect ? rect.x - parentRect.x : rect.x,
    top: parentRect ? rect.y - parentRect.y : rect.y,
    hasMeasured: true,
  }
}
