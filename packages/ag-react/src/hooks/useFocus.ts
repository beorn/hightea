/**
 * useFocus — Ink-compatible focus hook.
 *
 * Matches Ink 7.0's `useFocus(options?)` signature for drop-in migration.
 * Internally uses silvery's tree-based FocusManager (via FocusManagerContext)
 * rather than duplicating focus infrastructure.
 *
 * For silvery's richer focus API (focus origin tracking, blur, scope-aware
 * behavior), use `useFocusable()` instead — the two hooks coexist.
 *
 * @example Ink-compatible usage
 * ```tsx
 * import { useFocus, Box, Text } from "silvery"
 *
 * function Panel() {
 *   const { isFocused, focus } = useFocus({ id: "panel", autoFocus: true })
 *   return (
 *     <Box borderStyle="single" borderColor={isFocused ? "green" : "gray"}>
 *       <Text>{isFocused ? "Focused!" : "Click to focus"}</Text>
 *     </Box>
 *   )
 * }
 * ```
 *
 * @example Disable without removing
 * ```tsx
 * function ConditionalPanel({ active }: { active: boolean }) {
 *   const { isFocused } = useFocus({ id: "panel", isActive: active })
 *   return <Text>{isFocused ? "active" : "inactive"}</Text>
 * }
 * ```
 */

import { useCallback, useContext, useEffect, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context"
import type { FocusSnapshot } from "@silvery/ag/focus-manager"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for useFocus. Matches Ink 7.0's UseFocusOptions.
 */
export interface UseFocusOptions {
  /** Whether this component is currently focusable. Default: true. */
  isActive?: boolean
  /** Whether to auto-focus this component on mount. Default: false. */
  autoFocus?: boolean
  /** Focus ID. When provided, overrides the node's testID. */
  id?: string
}

/**
 * Return type for useFocus. Matches Ink 7.0's signature.
 */
export interface UseFocusResult {
  /** Whether this component is currently focused. */
  isFocused: boolean
  /** Programmatically focus a component by ID. */
  focus: (id: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Makes the current component focusable. Matches Ink 7.0's `useFocus()` API.
 *
 * Uses silvery's FocusManager under the hood. When `id` is provided, it
 * overrides the node's `testID` for focus identification. When `autoFocus`
 * is true, focuses this component on mount. When `isActive` is false,
 * blurs this component if focused and prevents future focus.
 */
export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)
  const { isActive = true, autoFocus = false, id } = options

  // Resolve focus ID: explicit id > node's testID
  const testID = node ? (((node.props as Record<string, unknown>).testID as string | undefined) ?? null) : null
  const focusId = id ?? testID

  // Subscribe to FocusManager state via useSyncExternalStore
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!fm) return () => {}
      return fm.subscribe(listener)
    },
    [fm],
  )

  const getSnapshot = useCallback(() => {
    if (!fm) return null
    return fm.getSnapshot()
  }, [fm])

  const snapshot: FocusSnapshot | null = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Derive focused state: active + has an ID + matches activeId
  const isFocused = isActive && focusId !== null && snapshot?.activeId === focusId

  // Auto-focus on mount (when autoFocus is true and we have a valid target)
  useEffect(() => {
    if (!fm || !autoFocus || !isActive) return
    if (node) {
      fm.focus(node, "programmatic")
    } else if (focusId) {
      // Virtual focus by ID when no node is available
      const root = findRoot(node)
      if (root) {
        fm.focusById(focusId, root, "programmatic")
      }
    }
  }, [fm, node, autoFocus, isActive, focusId])

  // When isActive becomes false, blur if currently focused
  useEffect(() => {
    if (!fm || !node) return
    if (!isActive && fm.activeElement === node) {
      fm.blur()
    }
  }, [fm, node, isActive])

  // Clean up: blur on unmount if this node is focused
  useEffect(() => {
    return () => {
      if (fm && node && fm.activeElement === node) {
        fm.blur()
      }
    }
  }, [fm, node])

  // focus(id) — programmatically focus another component by ID
  const focus = useCallback(
    (targetId: string) => {
      if (!fm) return
      const root = findRoot(node)
      if (root) {
        fm.focusById(targetId, root, "programmatic")
      }
    },
    [fm, node],
  )

  return { isFocused, focus }
}

// ============================================================================
// Helpers
// ============================================================================

/** Walk up to the tree root from a node. */
function findRoot(node: AgNode | null): AgNode | null {
  if (!node) return null
  let root = node
  while (root.parent) {
    root = root.parent
  }
  return root
}
