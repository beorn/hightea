/**
 * CLS Active Recorder — pipeline integration surface.
 *
 * The pipeline (layout-phase.ts) needs a way to find the currently-capturing
 * CLSRecorder without coupling to the runtime layer (App / termless / etc.).
 * The integration surface is a module-level "active recorder" reference:
 *
 *   - Pipeline calls `getActiveCLSRecorder()?.recordRect(...)` per node per
 *     frame. The optional-chain skips the call entirely when no capture is
 *     active — zero overhead in the common case.
 *
 *   - The capture API (termless `beginCLSCapture` / `endCLSCapture`) calls
 *     `setActiveCLSRecorder(r)` at begin and `clearActiveCLSRecorder()` at
 *     end, bracketing the window.
 *
 * Why a module-level ref instead of a per-Ag parameter:
 *   - Avoids threading a new arg through layoutPhase → propagateLayout
 *     (deep call chain, many internal callers).
 *   - The recorder ITSELF is still per-instance (createCLSRecorder) — only
 *     the "which recorder is currently capturing" pointer is module-scoped.
 *   - Multiple Apps coexisting in one process should not both run captures
 *     simultaneously (a single capture window is intended per session);
 *     `setActiveCLSRecorder` throws on double-set to enforce this.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import type { CLSRecorder } from "./cls-recorder"

let activeRecorder: CLSRecorder | null = null

/**
 * Read the currently-active recorder. The pipeline calls this once per
 * propagateLayout iteration (per node per frame); when null, the
 * optional-chained recordRect skips entirely.
 */
export function getActiveCLSRecorder(): CLSRecorder | null {
  return activeRecorder
}

/**
 * Set the active recorder. Throws when one is already set — caller must
 * `clearActiveCLSRecorder()` first. This prevents two concurrent captures
 * from silently sharing the pipeline hook.
 *
 * The caller (termless capture API) is responsible for pairing this with
 * `clearActiveCLSRecorder()` in a try/finally — leaking the active ref
 * means every subsequent frame pumps shifts into the abandoned recorder.
 */
export function setActiveCLSRecorder(recorder: CLSRecorder): void {
  if (activeRecorder !== null) {
    throw new Error(
      "setActiveCLSRecorder: another CLS capture is already active. Call clearActiveCLSRecorder() (or endCapture() on the holder) before starting a new one.",
    )
  }
  activeRecorder = recorder
}

/**
 * Clear the active recorder. Idempotent — safe to call when no recorder
 * is active (used by cleanup paths and tests).
 */
export function clearActiveCLSRecorder(): void {
  activeRecorder = null
}
