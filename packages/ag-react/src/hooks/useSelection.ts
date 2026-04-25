/**
 * useSelection — React hook for accessing the selection feature from the capability registry.
 *
 * Reads SELECTION_CAPABILITY from the app's CapabilityRegistry via context.
 * Returns `undefined` when the selection feature is not installed (e.g., simple
 * run() apps without pipe() composition, or when withDomEvents is not used).
 *
 * When installed, returns the current TerminalSelectionState and re-renders
 * reactively on selection changes via useSyncExternalStore.
 *
 * @deprecated Phase 4b of `km-silvery.view-as-layout-output` introduces
 * "selection as overlay/decoration": declare semantic selection via the
 * `selectionIntent` BoxProp (`<Box selectionIntent={{ from, to }}>`) and let
 * the layout phase write a list of rectangles into
 * `LayoutSignals.selectionFragments`. The selection-renderer reads from that
 * signal (via `findActiveSelectionFragments(root)`) without subscribing to a
 * capability bridge through `useSyncExternalStore`. This hook remains as a
 * one-cycle back-compat wrapper for callers reading the legacy
 * `TerminalSelectionState` (mouse-drag range, selecting flag, source). New
 * code should consume the layout-output signal instead — same shape as
 * `cursorOffset` / `focused`. Removed in the next major. See bead
 * `km-silvery.phase4-split-focus-selection`.
 */

import { useContext, useSyncExternalStore } from "react"
import { CapabilityRegistryContext } from "../context"
import type { TerminalSelectionState } from "@silvery/headless/selection"

// ============================================================================
// Capability symbol — must match the one in @silvery/create/internal/capabilities.
// Duplicated here to avoid a dependency from ag-react → @silvery/create internals.
// ============================================================================

const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

// ============================================================================
// SelectionFeature shape — minimal interface for the hook.
// ============================================================================

interface SelectionFeatureReadonly {
  readonly state: TerminalSelectionState
  subscribe(listener: () => void): () => void
}

// ============================================================================
// Fallbacks for useSyncExternalStore
// ============================================================================

const noopSubscribe = (_listener: () => void) => () => {}
const getUndefined = () => undefined as TerminalSelectionState | undefined

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the current selection state from the capability registry.
 *
 * Returns `undefined` when:
 * - No CapabilityRegistryContext is provided (simple run() apps)
 * - SELECTION_CAPABILITY is not registered (withDomEvents not used or selection disabled)
 *
 * Returns `TerminalSelectionState` when selection is installed:
 * - `state.range` — current SelectionRange or null (idle)
 * - `state.selecting` — true while mouse button is held
 * - `state.source` — "mouse" | "keyboard" | null
 *
 * @deprecated Use the `selectionIntent` BoxProp + `findActiveSelectionFragments`
 * tree-walk instead (Phase 4b layout-output path). See module-level
 * deprecation note above. Removed in the next major.
 */
export function useSelection(): TerminalSelectionState | undefined {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<SelectionFeatureReadonly>(SELECTION_CAPABILITY)

  return useSyncExternalStore(
    feature ? (listener) => feature.subscribe(listener) : noopSubscribe,
    feature ? () => feature.state : getUndefined,
  )
}
