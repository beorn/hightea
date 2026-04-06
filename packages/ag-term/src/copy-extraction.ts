/**
 * Copy Extraction
 *
 * Application-facing API that lets apps enrich copied content with
 * structured data (markdown, HTML, internal formats).
 *
 * When text is selected and copied, the nearest ancestor CopyProvider
 * gets a chance to enrich the plain text with semantic representations.
 * Plain text always goes to clipboard immediately; rich data is best-effort.
 *
 * Also manages the internal clipboard — a module-level store of the last
 * copy's rich data so paste events can detect internal copies.
 *
 * @example
 * ```tsx
 * const provider: SemanticCopyProvider = {
 *   enrichCopy(event) {
 *     return {
 *       text: event.text,
 *       markdown: `**${event.text}**`,
 *     }
 *   }
 * }
 *
 * <CopyProvider provider={provider}>
 *   <MyComponent />
 * </CopyProvider>
 * ```
 */

import type { SelectionRange } from "@silvery/headless/selection"

// ============================================================================
// ClipboardData
// ============================================================================

/**
 * Rich clipboard data that can hold multiple representations of copied content.
 * At minimum, `text` is always present. Other fields provide semantic enrichment.
 */
export interface ClipboardData {
  /** Plain text — always present, always written to system clipboard */
  text: string
  /** Markdown representation */
  markdown?: string
  /** HTML representation */
  html?: string
  /** Opaque internal data for in-app paste (serialized JSON, etc.) */
  internal?: unknown
}

// ============================================================================
// CopyEvent
// ============================================================================

/**
 * Event passed to SemanticCopyProvider.enrichCopy when copy is triggered.
 */
export interface CopyEvent {
  /** Plain text extracted from the terminal buffer */
  text: string
  /** Screen coordinates of the selection */
  range: SelectionRange
}

// ============================================================================
// SemanticCopyProvider
// ============================================================================

/**
 * Provider interface for enriching clipboard content with structured data.
 *
 * Registered on React components via CopyProvider context. When copy happens,
 * the nearest ancestor provider handles enrichment.
 *
 * The enrichCopy method can:
 * - Return ClipboardData synchronously
 * - Return a Promise<ClipboardData> for async enrichment
 * - Return void to skip enrichment (plain text only)
 */
export interface SemanticCopyProvider {
  enrichCopy(event: CopyEvent): ClipboardData | Promise<ClipboardData> | void
}

// ============================================================================
// PasteEvent
// ============================================================================

/**
 * Event delivered to paste handlers.
 *
 * Contains the pasted text and, when the paste text matches the last internal
 * copy, includes the rich clipboard data from that copy.
 */
export interface PasteEvent {
  /** Plain text from the terminal paste sequence */
  text: string
  /** "internal" when the paste matches the last copy from this app, "external" otherwise */
  source: "internal" | "external"
  /** Rich data from the last internal copy, if source is "internal" */
  data?: ClipboardData
}

// ============================================================================
// Internal Clipboard
// ============================================================================

/**
 * Shared internal clipboard — stores the last copy's rich data so paste
 * events can detect internal copies and include structured data.
 */
let internalClipboard: ClipboardData | null = null

/**
 * Get the current internal clipboard data.
 * Used by paste event handling to detect internal copies.
 */
export function getInternalClipboard(): ClipboardData | null {
  return internalClipboard
}

/**
 * Set the internal clipboard data.
 * Called after a copy operation to store rich data for paste detection.
 */
export function setInternalClipboard(data: ClipboardData | null): void {
  internalClipboard = data
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PasteEvent from bracketed paste text.
 * Checks against the internal clipboard to determine source.
 */
export function createPasteEvent(text: string, clipboard: ClipboardData | null): PasteEvent {
  if (clipboard && clipboard.text === text) {
    return {
      text,
      source: "internal",
      data: clipboard,
    }
  }

  return {
    text,
    source: "external",
  }
}

/**
 * Create a SemanticCopyProvider from a simple enrichment function.
 */
export function createCopyProvider(
  enrichCopy: (event: CopyEvent) => ClipboardData | Promise<ClipboardData> | void,
): SemanticCopyProvider {
  return { enrichCopy }
}
