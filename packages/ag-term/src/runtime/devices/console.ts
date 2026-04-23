/**
 * Console — single-owner console.* interceptor for a silvery session.
 *
 * Captures `console.log/info/warn/error/debug` during alt-screen rendering so
 * stray log output doesn't corrupt the TUI display. Entries are buffered and
 * can be replayed to the normal streams on exit (so the operator sees what
 * would have been printed) or rendered live inside the app via the `<Console>`
 * component (which reads `subscribe` + `getSnapshot`).
 *
 * Mirrors the other sub-owners in shape: constructed cheaply at term creation,
 * does nothing until `capture()` is called, `Symbol.dispose` is idempotent.
 *
 * ## Lifecycle
 *
 * One Console per Term. Capture is opt-in (`term.console.capture({suppress:true})`)
 * because hoisting it unconditionally at term creation would silently swallow
 * any log output from the caller's own setup code. `restore()` undoes the
 * patch; `dispose()` restores + clears subscribers.
 *
 * ## Relation to Output
 *
 * `Output` patches `process.stdout.write` / `process.stderr.write` / `console.*`
 * during alt-screen to suppress foreign writes and redirect stderr to
 * `DEBUG_LOG`. `Console` patches `console.*` alone to *capture* entries for
 * display + replay. They are complementary:
 *
 * - Output's console patch is a sink (write to DEBUG_LOG or drop).
 * - Console's patch is a tap (record for later use AND optionally forward).
 *
 * **Call order: Output first, then Console.** Last patch wins, so whichever
 * owner wraps `console.log` last is the one user calls hit first. With Output
 * first and Console second, `console.log(x)` hits Console's tap, Console
 * records the entry, and (unless `suppress: true`) forwards to its captured
 * "original" — which is Output's redirect wrapper. Net effect: tap fires for
 * every call, and Output's DEBUG_LOG redirect still applies to non-silvery
 * writes. Reversing the order (Console first, Output second) is the 2026-04-22
 * pro-review bug: Output overwrites Console's wrapper and the tap never fires.
 *
 * `restore()` in the reverse order — Console first, then Output — to unwind
 * the layering symmetrically.
 */

import { signal, type ReadSignal } from "@silvery/signals"

import type { ConsoleEntry, ConsoleMethod } from "../../ansi/types"
import { createConsoleRouter, type ConsoleRouter } from "./console-router"

/**
 * Aggregate counts of captured console output by severity.
 */
export interface ConsoleStats {
  total: number
  errors: number
  warnings: number
}

/**
 * Options for `console.capture()`.
 */
export interface ConsoleCaptureOptions {
  /**
   * Suppress forwarding to the original console methods.
   * Use in TUI / alt-screen mode where the raw output would corrupt the display.
   * Default: false.
   */
  suppress?: boolean
  /**
   * Store full entries in memory (default: true).
   * Set false for count-only mode — `getSnapshot()` returns empty, but
   * `getStats()` still tracks counts. Avoids unbounded memory growth for
   * long-running sessions where you only care about warning/error badges.
   */
  capture?: boolean
}

/**
 * Console — single-owner console.* capture + replay for a silvery session.
 *
 * Constructed lazily by `createTerm()` (no patching until `capture()`).
 * `subscribe` + `getSnapshot` are shaped for React's `useSyncExternalStore` —
 * each change produces a new array reference.
 */
export interface Console extends Disposable {
  /**
   * Start patching `console.log/info/warn/error/debug`. Idempotent — calling
   * while already capturing is a no-op (options are ignored on re-entry;
   * `restore()` then `capture()` again to change behaviour).
   */
  capture(options?: ConsoleCaptureOptions): void

  /**
   * Restore original console methods. Idempotent. Subscribers survive; you can
   * `capture()` again without re-subscribing. `dispose()` is the terminal
   * variant that also clears subscribers.
   */
  restore(): void

  /**
   * Whether `capture()` is currently active — a `ReadSignal<boolean>`.
   * Call `console.capturing()` to read; subscribe via
   * `effect(() => console.capturing())`. The owner writes it internally from
   * `capture()` / `restore()`.
   */
  readonly capturing: ReadSignal<boolean>

  /**
   * Notification signal — increments by 1 per captured entry (stats.total).
   * Cheap: no array copy, no object allocation. Consumers subscribe via
   * `effect(() => console.count())` and pull the full list lazily (via
   * `entriesSnapshot()`) only when they need it — typically on a debounce
   * flush in a React hook. Replaces the per-entry frozen-slice publish that
   * degraded to O(n²) for long sessions (Pro review 2026-04-22 P1-9).
   */
  readonly count: ReadSignal<number>

  /**
   * Return a frozen snapshot of captured entries at this moment. Slices on
   * demand — callers pay O(n) only when they actually need the list, not
   * on every log. Returns an empty frozen array when `capture=false` was
   * passed.
   */
  entriesSnapshot(): readonly ConsoleEntry[]

  /** Aggregate counts. Tracked even when `capture=false`. */
  getStats(): ConsoleStats

  /**
   * Replay captured entries to explicit streams (typically `process.stdout` +
   * `process.stderr` after exiting alt-screen). Entries whose stream was
   * `'stderr'` go to the stderr stream; the rest go to stdout. Does not clear
   * entries — call this alongside `dispose()` at TUI exit.
   */
  replay(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void

  dispose(): void
  [Symbol.dispose](): void
}

const STDERR_METHODS = new Set<ConsoleMethod>(["error", "warn"])
const EMPTY_ENTRIES: readonly ConsoleEntry[] = Object.freeze([])

/**
 * Create a Console owner backed by a ConsoleRouter. Starts in the restored
 * (non-capturing) state — call `capture()` to register the tap and (when
 * `suppress: true`) also push a suppress sink policy on the router.
 *
 * When no router is provided, Console constructs a private one patched
 * against the given `target` console global. Production Term factories
 * should pass a shared router so Console's tap and Output's sink layer
 * deterministically via a single patch site.
 */
export function createConsole(
  target: globalThis.Console = globalThis.console,
  router?: ConsoleRouter,
): Console {
  let disposed = false
  // Reactive `capturing` — written only by capture()/restore(), read by the
  // public `capturing` ReadSignal.
  const _capturing = signal<boolean>(false)
  let captureEntries = true

  // Authoritative ConsoleEntry[] — kept mutable; snapshots are frozen on
  // demand via entriesSnapshot(). Replaces the per-log frozen-slice publish
  // that degraded to O(n²) over long sessions (Pro review P1-9).
  const buffer: ConsoleEntry[] = []
  // Notification signal — increments on every captured entry. Cheap: no
  // array copy. Consumers subscribe via effect(() => console.count()),
  // then pull the buffer lazily with entriesSnapshot().
  const _count = signal<number>(0)
  const stats: ConsoleStats = { total: 0, errors: 0, warnings: 0 }

  const ownsRouter = !router
  const _router: ConsoleRouter = router ?? createConsoleRouter(target)

  let unregisterTap: (() => void) | null = null
  let unregisterSink: (() => void) | null = null

  function capture(options?: ConsoleCaptureOptions): void {
    if (disposed) return
    if (_capturing()) return
    _capturing(true)
    captureEntries = options?.capture ?? true
    // Tap records each call into the entry buffer + stats.
    unregisterTap = _router.registerTap((call) => {
      stats.total++
      if (call.method === "error") stats.errors++
      else if (call.method === "warn") stats.warnings++
      if (captureEntries) {
        buffer.push({
          method: call.method,
          args: call.args,
          stream: STDERR_METHODS.has(call.method) ? "stderr" : "stdout",
        })
      }
      // Always advance count so non-capturing consumers (count-only mode)
      // still get a reactive heartbeat for badges / activity indicators.
      _count(stats.total)
    })
    // `suppress: true` asks the router to drop forwarding entirely.
    // Without it, the router forwards to the active sink (Output's redirect)
    // or, if no sink is registered, to the original method.
    if (options?.suppress) {
      unregisterSink = _router.registerSink({ suppress: true })
    }
  }

  function restore(): void {
    if (!_capturing()) return
    _capturing(false)
    unregisterTap?.()
    unregisterTap = null
    unregisterSink?.()
    unregisterSink = null
  }

  function replay(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void {
    for (const entry of buffer) {
      const stream = entry.stream === "stderr" ? stderr : stdout
      const line =
        entry.args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? `${a.name}: ${a.message}`
                : safeJsonStringify(a),
          )
          .join(" ") + "\n"
      stream.write(line)
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    restore()
    if (ownsRouter) _router.dispose()
  }

  return {
    capture,
    restore,
    capturing: _capturing as ReadSignal<boolean>,
    count: _count as ReadSignal<number>,
    entriesSnapshot(): readonly ConsoleEntry[] {
      if (!captureEntries) return EMPTY_ENTRIES
      return Object.freeze(buffer.slice())
    },
    getStats() {
      return { ...stats }
    },
    replay,
    dispose,
    [Symbol.dispose]: dispose,
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
