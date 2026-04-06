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
import type { AdvancedClipboard } from "../ansi/advanced-clipboard"

// ============================================================================
// Types
// ============================================================================

/** Minimal clipboard interface used by interaction features. */
export interface ClipboardCapability {
  /** Copy plain text to the clipboard. */
  copy(text: string): void

  /**
   * Copy rich content (text/plain + text/html) to the clipboard.
   * Optional — when absent, only plain text copy is available.
   * When present, selection features should prefer this over copy().
   */
  copyRich?(text: string, html: string): void
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

/**
 * Create a rich clipboard capability backed by AdvancedClipboard (OSC 5522).
 *
 * Provides both `copy(text)` and `copyRich(text, html)`. When the terminal
 * supports OSC 5522, both MIME types are sent. When it doesn't, the
 * AdvancedClipboard falls back to OSC 52 for plain text only.
 */
export function createRichClipboard(advancedClipboard: AdvancedClipboard): ClipboardCapability {
  return {
    copy(text: string): void {
      advancedClipboard.copyText(text)
    },

    copyRich(text: string, html: string): void {
      advancedClipboard.copyRich(text, html)
    },
  }
}
