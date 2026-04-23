/**
 * ANSI string utilities.
 *
 * This module can be imported separately via `@silvery/ansi/utils`
 * for projects that only need ANSI stripping without chalk.
 */

import stringWidth from "string-width"

// =============================================================================
// ANSI Regex Pattern
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 *
 * Matches:
 * - ESC CSI SGR sequences: \x1b[31m, \x1b[4:3m, \x1b[38:2::255:100:0m
 * - C1 CSI SGR sequences: \x9b31m, \x9b4:3m
 * - ESC OSC 8 hyperlinks (BEL-terminated): \x1b]8;;<url>\x07
 * - ESC OSC 8 hyperlinks (ST-terminated): \x1b]8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (BEL-terminated): \x9d8;;<url>\x07
 * - C1 OSC 8 hyperlinks (ST-terminated): \x9d8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (C1 ST-terminated): \x9d8;;<url>\x9c
 */
export const ANSI_REGEX =
  /\x1b\[[0-9;:]*m|\x9b[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)|\x9d8;;[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Clean string with all ANSI codes removed
 *
 * @example
 * ```ts
 * stripAnsi('\x1b[31mred\x1b[0m') // 'red'
 * stripAnsi('\x1b[4:3mwavy\x1b[4:0m') // 'wavy'
 * ```
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

/**
 * Get the display width of a string, excluding ANSI escape codes.
 * Correctly handles CJK characters, emoji, and other wide characters.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Number of terminal columns the text will occupy
 *
 * @example
 * ```ts
 * displayLength('\x1b[31mhello\x1b[0m') // 5
 * displayLength('hello') // 5
 * displayLength('한글') // 4 (2 chars × 2 cells each)
 * ```
 */
export function displayLength(text: string): number {
  return stringWidth(stripAnsi(text))
}

// =============================================================================
// warnOnce — shared dev-warning latch
// =============================================================================

/**
 * Process-lifetime set of warning IDs that have already fired. Used by
 * {@link warnOnce} to avoid console spam on every re-render / every paste /
 * every parse. Shared across packages — one latch per warning ID, regardless
 * of which module emits it.
 *
 * Intentionally process-global (not scoped per {@link Term}) because the
 * warnings gated here describe developer-mistake conditions that are
 * semantically "once per process": spam is worse than missed repeats.
 */
const _firedWarnings = new Set<string>()

/**
 * Emit a warning exactly once per process, keyed by `id`.
 *
 * The first call with a given `id` invokes `emit(message)`; subsequent calls
 * with the same `id` are no-ops. Use for dev-mode checks that would otherwise
 * spam the console on every render pass / every keystroke / every reconcile.
 *
 * Consolidates what used to be three parallel `let hasWarned*` latches
 * scattered across silvery packages (`test/index.tsx`,
 * `ag-react/reconciler/host-config.ts`, `ag/keys.ts`). See
 * km-silvery.latch-consolidation.
 *
 * @param id - Unique warning identifier (stable across restarts). Convention:
 *   `<package>:<short-slug>`, e.g. `"silvery/test:termless-leak"`,
 *   `"silvery/ag-react:box-in-text"`.
 * @param emit - Callback that actually produces the warning. Called once.
 *   Omit to use `console.warn` with no message (rarely useful — prefer an
 *   explicit emit).
 *
 * @example
 * ```ts
 * import { warnOnce } from "@silvery/ansi"
 *
 * function validateBoxInText() {
 *   if (!isValid) {
 *     warnOnce("silvery/ag-react:box-in-text", () =>
 *       console.warn("<Box> cannot be nested inside <Text>.")
 *     )
 *   }
 * }
 * ```
 */
export function warnOnce(id: string, emit: () => void): void {
  if (_firedWarnings.has(id)) return
  _firedWarnings.add(id)
  emit()
}

/**
 * Reset the warn-once latch — test-only.
 *
 * With no argument, clears every warning ID. With an explicit ID, clears just
 * that one (lets a test exercise its own warning without disturbing others).
 * Export is prefixed `_` to signal "test infrastructure, do not call from
 * production code."
 */
export function _resetWarnOnceForTesting(id?: string): void {
  if (id === undefined) _firedWarnings.clear()
  else _firedWarnings.delete(id)
}
