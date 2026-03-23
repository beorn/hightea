/**
 * useListItem - Context hook for items inside a ListView.
 *
 * Provides freeze control and status information to items rendered
 * within a ListView (or ScrollbackList). Items call `freeze()` to signal
 * they are complete and should be pushed to terminal scrollback.
 *
 * This is the new name for useScrollbackItem — both export the same
 * underlying context and functionality.
 *
 * @example
 * ```tsx
 * function TaskItem({ task }: { task: Task }) {
 *   const { freeze, isFrozen } = useListItem()
 *
 *   useEffect(() => {
 *     if (task.status === "done") freeze()
 *   }, [task.status])
 *
 *   return <Text>{task.title}</Text>
 * }
 * ```
 */

import type { ReactElement } from "react"
import { useScrollbackItem } from "./useScrollbackItem"
import type { ScrollbackItemContext } from "./useScrollbackItem"

// ============================================================================
// Types
// ============================================================================

/** Context value provided to each item inside a ListView / ScrollbackList. */
export interface ListItemContext {
  /** Signal that this item is complete and should freeze into scrollback.
   *  Optionally pass a snapshot JSX element to use instead of re-rendering
   *  the item's live children. */
  freeze: (snapshot?: ReactElement) => void
  /** Whether this item has already been frozen into scrollback. */
  isFrozen: boolean
  /** The index of this item in the items array. */
  index: number
  /** True when item is close to the scrollback boundary. */
  nearScrollback: boolean
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the list item context from within a ListView or ScrollbackList item.
 *
 * Must be called from a component rendered as a child of ScrollbackList.
 * Throws if used outside of that context.
 */
export function useListItem(): ListItemContext {
  return useScrollbackItem()
}

// Re-export the provider for internal use
export { ScrollbackItemProvider as ListItemProvider } from "./useScrollbackItem"

// Re-export the type for compatibility
export type { ScrollbackItemContext }
