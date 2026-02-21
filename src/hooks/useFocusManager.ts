/**
 * Inkx useFocusManager Hook
 *
 * Provides methods to control focus management for all components.
 * Rewritten to use the new tree-based FocusManager via FocusManagerContext.
 *
 * Falls back to the legacy FocusContext if FocusManagerContext is not available,
 * maintaining backward compatibility.
 */

import { useCallback, useContext, useSyncExternalStore } from "react"
import { FocusContext, FocusManagerContext, NodeContext } from "../context.js"
import type { FocusSnapshot } from "../focus-manager.js"
import type { InkxNode } from "../types.js"

// ============================================================================
// Types
// ============================================================================

export interface UseFocusManagerResult {
  /** Currently focused node (null if nothing focused) */
  activeElement: InkxNode | null
  /** testID of the currently focused node */
  activeId: string | null
  /** Focus a specific node or node by testID */
  focus: (nodeOrId: InkxNode | string) => void
  /** Focus the next focusable element in tab order */
  focusNext: () => void
  /** Focus the previous focusable element in tab order */
  focusPrev: () => void
  /** Clear focus */
  blur: () => void
  /** Legacy: Enable focus management (no-op in new system) */
  enableFocus: () => void
  /** Legacy: Disable focus management (no-op in new system) */
  disableFocus: () => void
  /** Legacy: Focus previous (alias for focusPrev) */
  focusPrevious: () => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing focus across all focusable components.
 *
 * Uses the new tree-based FocusManager when available (FocusManagerContext),
 * falling back to the legacy FocusContext for backward compatibility.
 *
 * @example
 * ```tsx
 * function Navigation() {
 *   const { focusNext, focusPrev } = useFocusManager()
 *
 *   useInput((input, key) => {
 *     if (key.tab) {
 *       if (key.shift) {
 *         focusPrev()
 *       } else {
 *         focusNext()
 *       }
 *     }
 *   })
 *
 *   return <Text>Tab to navigate</Text>
 * }
 * ```
 */
export function useFocusManager(): UseFocusManagerResult {
  const fm = useContext(FocusManagerContext)
  const legacyContext = useContext(FocusContext)
  const node = useContext(NodeContext)

  // Subscribe to FocusManager state
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

  // Helper: get the render tree root from the current node
  const getRoot = useCallback((): InkxNode | null => {
    if (!node) return null
    let root = node
    while (root.parent) {
      root = root.parent
    }
    return root
  }, [node])

  // --- New FocusManager path ---
  if (fm) {
    const focus = (nodeOrId: InkxNode | string) => {
      if (typeof nodeOrId === "string") {
        const root = getRoot()
        if (root) {
          fm.focusById(nodeOrId, root, "programmatic")
        }
      } else {
        fm.focus(nodeOrId, "programmatic")
      }
    }

    const focusNext = () => {
      const root = getRoot()
      if (root) fm.focusNext(root)
    }

    const focusPrev = () => {
      const root = getRoot()
      if (root) fm.focusPrev(root)
    }

    return {
      activeElement: fm.activeElement,
      activeId: snapshot?.activeId ?? null,
      focus,
      focusNext,
      focusPrev,
      blur: () => fm.blur(),
      // Legacy compat — no-ops in the new system
      enableFocus: () => {},
      disableFocus: () => {},
      focusPrevious: focusPrev,
    }
  }

  // --- Legacy FocusContext fallback ---
  if (legacyContext) {
    return {
      activeElement: null,
      activeId: legacyContext.activeId,
      focus: (nodeOrId: InkxNode | string) => {
        if (typeof nodeOrId === "string") {
          legacyContext.focus(nodeOrId)
        }
      },
      focusNext: legacyContext.focusNext,
      focusPrev: legacyContext.focusPrevious,
      blur: () => {},
      enableFocus: legacyContext.enableFocus,
      disableFocus: legacyContext.disableFocus,
      focusPrevious: legacyContext.focusPrevious,
    }
  }

  // No focus context available — return inert result (safe for standalone component tests)
  return {
    activeElement: null,
    activeId: null,
    focus: () => {},
    focusNext: () => {},
    focusPrev: () => {},
    blur: () => {},
    enableFocus: () => {},
    disableFocus: () => {},
    focusPrevious: () => {},
  }
}
