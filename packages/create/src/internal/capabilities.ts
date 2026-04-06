/**
 * Capability symbols — well-known keys for the CapabilityRegistry.
 *
 * Features register themselves under these symbols so other parts
 * of the composition chain can discover and interact with them.
 *
 * @internal Not exported from the public barrel.
 */

/** Selection feature: text selection state + mouse handling. */
export const SELECTION_CAPABILITY = Symbol("silvery.selection")

/** Clipboard feature: copy/paste via OSC 52 or other backends. */
export const CLIPBOARD_CAPABILITY = Symbol("silvery.clipboard")

/** Input router: priority-based event dispatch for interaction features. */
export const INPUT_ROUTER = Symbol("silvery.input-router")
