/**
 * Silvery useFocus Hook — Ink-compatible flat-list focus registration.
 *
 * A thin wrapper over the native silvery FocusManager that matches Ink 7.0's
 * `useFocus(options)` signature. Components registered via this hook form a
 * flat tab cycle managed by the FocusManager, alongside (and after) any
 * tree-based focusables declared via `<Box focusable>`.
 *
 * For silvery-native components that want scope-aware behavior, spatial
 * navigation, or focus origin tracking, prefer `useFocusable` — it is richer,
 * prop-based, and tree-aware. `useFocus` exists to make dropping in Ink
 * migrations effortless while keeping a single unified focus system.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context"
import type { FocusSnapshot } from "@silvery/ag/focus-manager"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Types
// ============================================================================

export interface UseFocusOptions {
  /** Temporarily disable focus without losing tab position. Default: true. */
  isActive?: boolean
  /** Focus this component on mount. Default: false. */
  autoFocus?: boolean
  /** Stable focus ID. If omitted, a stable random id is generated per mount. */
  id?: string
}

export interface UseFocusResult {
  /** Whether this component is currently focused. */
  isFocused: boolean
  /** Focus a hook-registered component by id (matches Ink's signature). */
  focus: (id: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Ink-compatible `useFocus` hook (matches Ink 7.0's signature).
 *
 * Registers the component as a hook-based focusable in the native
 * FocusManager, tracking the snapshot via `useSyncExternalStore` for
 * tear-free reads. Participates in the unified Tab/Shift+Tab cycle.
 *
 * When `isActive` is `false`, the id remains registered but is skipped
 * in tab order and never reports as focused. This matches Ink's semantics.
 *
 * @example
 * ```tsx
 * function MyInput() {
 *   const { isFocused } = useFocus({ id: "my-input", autoFocus: true })
 *   return <Box borderColor={isFocused ? "cyan" : "gray"}>...</Box>
 * }
 * ```
 */
export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)
  const { isActive = true, autoFocus = false, id: customId } = options

  // Stable id across renders: use customId if provided, otherwise generate
  // a random id once at mount time (matches Ink's behaviour).
  const generatedIdRef = useRef<string | null>(null)
  if (customId === undefined && generatedIdRef.current === null) {
    generatedIdRef.current = `ink-focus-${Math.random().toString(36).slice(2, 9)}`
  }
  const focusId = customId ?? (generatedIdRef.current as string)

  // Register with FocusManager on mount; re-register when id changes.
  // autoFocus only applies to the initial registration — matches Ink.
  useEffect(() => {
    if (!fm) return
    const unregister = fm.registerHookFocusable(focusId, {
      isActive,
      autoFocus,
    })
    return unregister
    // isActive intentionally excluded — handled by the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm, focusId, autoFocus])

  // Update active state when isActive toggles.
  useEffect(() => {
    if (!fm) return
    fm.setHookFocusableActive(focusId, isActive)
  }, [fm, focusId, isActive])

  // Subscribe to FocusManager snapshot via useSyncExternalStore.
  const subscribe = useCallback(
    (listener: () => void) => fm?.subscribe(listener) ?? (() => {}),
    [fm],
  )
  const getSnapshot = useCallback(() => fm?.getSnapshot() ?? null, [fm])
  const snapshot: FocusSnapshot | null = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Derive focused state — gated by isActive to match Ink's semantics.
  const isFocused = isActive && snapshot?.activeId === focusId

  // Helper to walk up to the tree root for focusById.
  const getRoot = useCallback((): AgNode | null => {
    if (!node) return null
    let root: AgNode | null = node
    while (root && root.parent) root = root.parent
    return root
  }, [node])

  // Focus a hook-registered id by name (Ink API signature).
  const focus = useMemo(() => {
    return (targetId: string) => {
      if (!fm) return
      // Prefer direct virtual focus — no tree lookup needed for hook ids.
      // If the target happens to be a tree testID, users can use
      // `useFocusable` or `useFocusManager().focus(node)` instead.
      const root = getRoot()
      if (root) {
        fm.focusById(targetId, root, "programmatic")
      } else {
        fm.focusVirtualId(targetId, "programmatic")
      }
    }
  }, [fm, getRoot])

  return { isFocused, focus }
}
