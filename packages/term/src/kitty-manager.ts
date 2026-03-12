/**
 * Kitty keyboard protocol manager.
 *
 * Handles lifecycle (enable/disable/auto-detect) for the Kitty keyboard
 * protocol. Used by both test and interactive rendering paths.
 *
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */

import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard } from "./output"

/** Regex to match a Kitty keyboard query response: CSI ? <digits> u */
const KITTY_RESPONSE_RE = /\x1b\[\?(\d+)u/

/** Kitty protocol manager handle. */
export interface KittyManager {
  /** Whether the kitty keyboard protocol is currently enabled. */
  enabled: boolean
  /** Disable the protocol and clean up any pending detection. */
  cleanup(): void
}

/** Options for configuring the kitty keyboard protocol manager. */
export interface KittyManagerOptions {
  /** Detection mode: "enabled" activates immediately, "auto" probes the terminal, "disabled" does nothing. */
  mode?: "auto" | "enabled" | "disabled"
  /** Bitmask of KittyFlags to enable. Defaults to KittyFlags.DISAMBIGUATE (1). */
  flags?: number
}

/**
 * Create a kitty protocol manager that handles setup and teardown.
 *
 * Supports three modes:
 * - "enabled": enable immediately if stdin/stdout are TTYs
 * - "auto": probe the terminal for support, enable if detected
 * - "disabled" / undefined: do nothing
 */
export function createKittyManager(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  opts: KittyManagerOptions | undefined,
): KittyManager {
  let enabled = false
  let cancelDetection: (() => void) | undefined

  function enable(flagBitmask: number): void {
    stdout.write(enableKittyKeyboard(flagBitmask))
    enabled = true
  }

  if (opts) {
    const mode = opts.mode ?? "auto"
    const flagBitmask = opts.flags ?? 1 // Default: DISAMBIGUATE
    const isTTY = (stdin as any)?.isTTY && (stdout as any)?.isTTY

    if (isTTY) {
      if (mode === "enabled") {
        enable(flagBitmask)
      } else if (mode === "auto") {
        cancelDetection = initKittyAutoDetection(stdin, stdout, flagBitmask, enable)
      }
    }
  }

  return {
    get enabled() {
      return enabled
    },
    cleanup() {
      if (cancelDetection) {
        cancelDetection()
        cancelDetection = undefined
      }
      if (enabled) {
        stdout.write(disableKittyKeyboard())
        enabled = false
      }
    },
  }
}

/**
 * Initialize kitty keyboard auto-detection.
 *
 * Queries the terminal for support, listens for the response, and enables
 * the protocol if supported. Returns a cleanup function to cancel detection.
 *
 * Uses a synchronous event-based approach (not async) because render() must
 * return synchronously. Delegates to @silvery/term for escape sequences.
 */
function initKittyAutoDetection(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  flagBitmask: number,
  onEnable: (flags: number) => void,
): () => void {
  let responseBuffer = ""
  let cleaned = false
  let unmounted = false

  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    clearTimeout(timer)
    stdin.removeListener("data", onData)

    // Re-emit any buffered data that wasn't the protocol response
    const remaining = responseBuffer.replace(KITTY_RESPONSE_RE, "")
    responseBuffer = ""
    if (remaining.length > 0) {
      stdin.unshift(Buffer.from(remaining))
    }
  }

  const onData = (data: Uint8Array | string): void => {
    responseBuffer += typeof data === "string" ? data : data.toString()

    if (KITTY_RESPONSE_RE.test(responseBuffer)) {
      cleanup()
      if (!unmounted) {
        onEnable(flagBitmask)
      }
    }
  }

  // Attach listener before writing the query so synchronous responses are not missed
  stdin.on("data", onData)
  const timer = setTimeout(cleanup, 200)

  stdout.write(queryKittyKeyboard())

  return () => {
    unmounted = true
    cleanup()
  }
}
