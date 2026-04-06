/**
 * useCopyProvider — React context for semantic copy providers.
 *
 * When copy is triggered, the nearest ancestor CopyProvider enriches
 * plain text with structured data (markdown, HTML, internal formats).
 *
 * @example
 * ```tsx
 * const provider: SemanticCopyProvider = {
 *   enrichCopy(event) {
 *     return { text: event.text, markdown: `**${event.text}**` }
 *   }
 * }
 *
 * <CopyProvider provider={provider}>
 *   <MyComponent />
 * </CopyProvider>
 * ```
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { SemanticCopyProvider } from "@silvery/ag-term/semantic-copy"

// ============================================================================
// Context
// ============================================================================

const CopyProviderContext = createContext<SemanticCopyProvider | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Registers a semantic copy provider for its subtree.
 * When copy happens within this subtree, the provider's enrichCopy
 * method is called to produce rich clipboard data.
 */
export function CopyProvider({ provider, children }: { provider: SemanticCopyProvider; children: ReactNode }) {
  return React.createElement(CopyProviderContext.Provider, { value: provider }, children)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the nearest ancestor CopyProvider.
 * Returns null if no provider is in the tree above this component.
 */
export function useCopyProvider(): SemanticCopyProvider | null {
  return useContext(CopyProviderContext)
}
