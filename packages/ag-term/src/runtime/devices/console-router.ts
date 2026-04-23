/**
 * ConsoleRouter — single patcher for `console.log/info/warn/error/debug`.
 *
 * Before this owner existed, `Console` and `Output` independently monkey-
 * patched `console.*` — the last patcher to activate stole the wrappers from
 * the earlier one. Pro review 2026-04-22 P0-3 flagged this; the structural
 * fix is exactly one patcher that both owners register policies against.
 *
 * The router owns the five `target[method] = ...` installs and the matching
 * restore. Console and Output call `registerTap` / `registerSink` to declare
 * intent; the router composes them in a single wrapper per method.
 *
 * ### Invocation order per `console.*` call
 *
 * 1. All registered **taps** fire in registration order.
 *    Taps are pure observers — they see the call but cannot change it.
 *    Used by `term.console` to record entries for later replay.
 *
 * 2. The **sink policy** decides forwarding:
 *    - `suppress: true` → drop the call (no original forward, no redirect).
 *    - `redirectFd`    → write a formatted single-line copy to that fd
 *                        (canonical use: redirect stderr to DEBUG_LOG so
 *                        foreign console.warn doesn't corrupt the alt screen).
 *    - neither         → forward to the ORIGINAL console method captured
 *                        before any patching.
 *   Only the most recently registered sink is consulted (last-one-wins).
 *   Unregistering a sink reverts to the prior sink (stack discipline) —
 *   or, if no sink is registered, the call is forwarded.
 *
 * ### Lifecycle
 *
 * Router construction is free. First `registerTap` or `registerSink` call
 * installs all five wrappers and captures originals. Last unregister (both
 * tap set empty AND sink stack empty) restores the originals and clears
 * the wrappers. Dispose is an explicit reset.
 */

import type { ConsoleMethod } from "../../ansi/types"
import { writeSync } from "node:fs"

const METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"]

/** Shape a tap handler receives on every console.* call. */
export interface ConsoleCall {
  method: ConsoleMethod
  args: unknown[]
}

/** Sink policy registered by a consumer (e.g. Output's alt-screen guard). */
export interface ConsoleSinkPolicy {
  /**
   * If true, the call is dropped (no forward to original, no redirect).
   * Default: false.
   */
  suppress?: boolean
  /**
   * If set, a single-line formatted copy of the call is written via
   * `fs.writeSync(redirectFd, …)`. Typical use: redirect console.* to
   * DEBUG_LOG during alt-screen. Mutually exclusive with `suppress: true`
   * at the semantic level (if both are set, `suppress` wins).
   */
  redirectFd?: number | null
}

/**
 * Public shape of a ConsoleRouter.
 */
export interface ConsoleRouter extends Disposable {
  /**
   * Register a tap: called on every console.* call in registration order,
   * before sink policy. Tap handlers are pure observers. Returns an
   * unregister function.
   */
  registerTap(handler: (call: ConsoleCall) => void): () => void

  /**
   * Register a sink policy. The most recently registered sink is the
   * active one (stack semantics). Unregister pops the stack back to the
   * prior sink. Returns an unregister function.
   */
  registerSink(policy: ConsoleSinkPolicy): () => void

  /** True while at least one tap OR sink is registered (i.e. wrappers installed). */
  readonly active: boolean

  /** Dispose — restore originals, clear taps + sinks. Idempotent. */
  dispose(): void
  [Symbol.dispose](): void
}

/**
 * Format a console call into a single line for DEBUG_LOG redirect.
 * Shape matches Console.replay's format: args joined with space, newline.
 */
function formatLine(call: ConsoleCall): string {
  return (
    call.args
      .map((a) =>
        typeof a === "string"
          ? a
          : a instanceof Error
            ? `${a.name}: ${a.message}`
            : safeJsonStringify(a),
      )
      .join(" ") + "\n"
  )
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Create a ConsoleRouter patching the given console global (defaults to
 * `globalThis.console`). Construction is cheap: no patching happens until
 * the first `registerTap` / `registerSink` call. Every subsequent register
 * joins the existing wrappers; unregister that drops the last registrant
 * restores the originals.
 */
export function createConsoleRouter(
  target: globalThis.Console = globalThis.console,
): ConsoleRouter {
  const taps = new Set<(call: ConsoleCall) => void>()
  const sinkStack: ConsoleSinkPolicy[] = []
  const originals = new Map<ConsoleMethod, globalThis.Console[ConsoleMethod]>()
  let installed = false
  let disposed = false

  function currentSink(): ConsoleSinkPolicy | null {
    return sinkStack.length > 0 ? sinkStack[sinkStack.length - 1]! : null
  }

  function install() {
    if (installed || disposed) return
    installed = true
    for (const method of METHODS) {
      originals.set(method, target[method])
      const original = originals.get(method)!
      target[method] = ((...args: unknown[]) => {
        const call: ConsoleCall = { method, args }

        // 1. Fan out to taps. Isolated in try/catch — a broken tap must not
        //    derail forwarding or other taps. (Matches the signals-owner
        //    isolation pattern.)
        for (const tap of taps) {
          try {
            tap(call)
          } catch {
            /* isolate */
          }
        }

        // 2. Apply sink policy.
        const sink = currentSink()
        if (sink?.suppress) return
        if (sink?.redirectFd != null) {
          try {
            writeSync(sink.redirectFd, formatLine(call))
          } catch {
            /* fd may be closed */
          }
          return
        }
        // 3. No sink → forward to the captured original.
        ;(original as (...a: unknown[]) => void).call(target, ...args)
      }) as globalThis.Console[ConsoleMethod]
    }
  }

  function uninstall() {
    if (!installed) return
    for (const method of METHODS) {
      const original = originals.get(method)
      if (original) target[method] = original
    }
    originals.clear()
    installed = false
  }

  function maybeUninstall() {
    if (taps.size === 0 && sinkStack.length === 0) uninstall()
  }

  function registerTap(handler: (call: ConsoleCall) => void): () => void {
    if (disposed) return () => {}
    taps.add(handler)
    install()
    return () => {
      taps.delete(handler)
      maybeUninstall()
    }
  }

  function registerSink(policy: ConsoleSinkPolicy): () => void {
    if (disposed) return () => {}
    sinkStack.push(policy)
    install()
    return () => {
      const idx = sinkStack.lastIndexOf(policy)
      if (idx >= 0) sinkStack.splice(idx, 1)
      maybeUninstall()
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    uninstall()
    taps.clear()
    sinkStack.length = 0
  }

  return {
    registerTap,
    registerSink,
    get active() {
      return installed
    },
    dispose,
    [Symbol.dispose]: dispose,
  }
}
