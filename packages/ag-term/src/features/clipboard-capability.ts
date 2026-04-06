/**
 * Clipboard Capability — lightweight interface for copy operations.
 *
 * The SelectionFeature uses this to copy selected text to the system
 * clipboard (via OSC 52) or an internal store.
 *
 * This is a thin adapter over the full ClipboardBackend from clipboard.ts.
 * The feature interface is intentionally minimal: just `copy(text)`.
 */

import type { ClipboardBackend } from "../clipboard"

// ============================================================================
// Types
// ============================================================================

/** Minimal clipboard interface used by interaction features. */
export interface ClipboardCapability {
  /** Copy plain text to the clipboard. */
  copy(text: string): void
}

// ============================================================================
// Factories
// ============================================================================

/** Minimal writable interface for clipboard output. */
interface Writable {
  write(data: string): boolean | void
}

/**
 * Create an OSC 52 clipboard capability.
 *
 * Encodes text as base64 and writes the OSC 52 sequence directly.
 * This is a standalone factory that doesn't require the full ClipboardBackend.
 */
export function createOSC52Clipboard(write: (data: string) => void): ClipboardCapability {
  return {
    copy(text: string): void {
      const base64 = Buffer.from(text, "utf-8").toString("base64")
      write(`\x1b]52;c;${base64}\x07`)
    },
  }
}

/**
 * Wrap an existing ClipboardBackend as a ClipboardCapability.
 *
 * Useful when withTerminal has already created a full backend and
 * the selection feature just needs the `copy()` method.
 */
export function wrapClipboardBackend(backend: ClipboardBackend): ClipboardCapability {
  return {
    copy(text: string): void {
      backend.write({ text })
    },
  }
}
