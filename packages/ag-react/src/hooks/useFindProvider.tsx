/**
 * useFindProvider — React context for virtual list find providers.
 *
 * When a FindProvider is registered in the tree, the useFind hook delegates
 * search to the provider's model-level search instead of scanning the
 * visible buffer. This enables find-in-virtual-list where off-screen
 * items aren't in the terminal buffer.
 *
 * @example
 * ```tsx
 * const provider: FindProvider = {
 *   search(query) {
 *     return items
 *       .filter(item => item.text.includes(query))
 *       .map((item, i) => ({ itemId: item.id, offset: item.text.indexOf(query), length: query.length }))
 *   },
 *   reveal(result) {
 *     scrollToItem(result.itemId)
 *   }
 * }
 *
 * <FindProviderComponent provider={provider}>
 *   <VirtualList />
 * </FindProviderComponent>
 * ```
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { FindProvider } from "@silvery/headless/find"

// ============================================================================
// Context
// ============================================================================

const FindProviderContext = createContext<FindProvider | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Registers a FindProvider for its subtree.
 * When find is active within this subtree, the provider's search() is used
 * instead of buffer-level search, and reveal() scrolls to make results visible.
 */
export function FindProviderComponent({ provider, children }: { provider: FindProvider; children: ReactNode }) {
  return React.createElement(FindProviderContext.Provider, { value: provider }, children)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the nearest ancestor FindProvider.
 * Returns null if no provider is in the tree above this component.
 */
export function useFindProvider(): FindProvider | null {
  return useContext(FindProviderContext)
}
