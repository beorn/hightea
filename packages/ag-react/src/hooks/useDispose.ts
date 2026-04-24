/**
 * useDispose — one-hook lifecycle cleanup.
 *
 * silvery already has a signal-mediator (`term.signals`) that owns SIGINT /
 * SIGTERM / exit registrations. But wiring a dispose step into every exit
 * path takes ~10 lines of boilerplate per silvery app: useTerm(),
 * term.signals.on(), plus a React useEffect return that both unregisters
 * and runs the same dispose on unmount. Every subprocess-spawning app
 * reinvents it.
 *
 * useDispose collapses that to one line at the call site:
 *
 *   useDispose(() => controller.killAll())
 *
 * It registers `dispose` into ALL of these exit paths:
 *   - silvery's SIGINT handler (via term.signals)
 *   - silvery's SIGTERM handler (same mediator)
 *   - React unmount (via the useEffect cleanup)
 *
 * That's the common case: "run this function when the app goes down,
 * regardless of which path the teardown takes". Apps that need finer
 * control (priority, before/after ordering, specific signals) can still
 * drop down to `useTerm().signals.on(...)` directly — useDispose is the
 * shortcut, not a replacement.
 *
 * Dispose runs at most once per React mount, guarded so SIGINT + unmount
 * can't both invoke it and get the app into a weird double-dispose state.
 */

import { useEffect, useRef } from "react"
import { useTerm } from "./useTerm"

export interface UseDisposeOptions {
  /**
   * Sort key passed to term.signals.on — lower runs first.
   * Default 5 (app-level cleanup tier). See
   * packages/ag-term/src/runtime/devices/signals.ts for the conventions.
   */
  priority?: number
  /**
   * Human-readable name for the registration. Useful for debugging /
   * inspecting the term.signals registry; doesn't affect behavior.
   * Default "app-dispose".
   */
  name?: string
  /**
   * Which signals to hook. Default: ["SIGINT", "SIGTERM"].
   * Pass a shorter list to opt out of some paths.
   */
  signals?: ReadonlyArray<NodeJS.Signals>
}

/**
 * Register `dispose` to run on app exit. Handles SIGINT / SIGTERM / React
 * unmount, de-duplicating so dispose runs at most once per mount.
 *
 * The `dispose` function may be sync or async. Async disposes are
 * fire-and-forget — silvery's signal path can't meaningfully wait on a
 * Promise, so long-running cleanup should prefer sync SIGKILL + let the
 * OS/pipes drain naturally (see the silvercode pattern).
 */
export function useDispose(
  dispose: () => void | Promise<void>,
  options: UseDisposeOptions = {},
): void {
  const term = useTerm()
  // Keep the latest dispose in a ref so the effect below doesn't need to
  // depend on it. Without this, a caller that passes an inline arrow
  // (`useDispose(() => controller.closeAll())`) re-runs the effect on every
  // render — and each re-run fires the previous effect's cleanup, which
  // synchronously runs dispose(). The subprocess dies 117ms into app
  // startup, before the first user message can reach it.
  const disposeRef = useRef(dispose)
  disposeRef.current = dispose

  // Same for options fields — callers shouldn't need to memoize them.
  const priorityRef = useRef(options.priority ?? 5)
  priorityRef.current = options.priority ?? 5
  const nameRef = useRef(options.name ?? "app-dispose")
  nameRef.current = options.name ?? "app-dispose"
  const signalsKey = (options.signals ?? ["SIGINT", "SIGTERM"]).join(",")

  useEffect(() => {
    let disposed = false
    function runOnce(): void {
      if (disposed) return
      disposed = true
      try {
        const maybe = disposeRef.current()
        if (maybe && typeof (maybe as Promise<void>).catch === "function") {
          void (maybe as Promise<void>).catch(() => {
            /* async dispose errors are swallowed — we're tearing down */
          })
        }
      } catch {
        /* sync dispose errors are swallowed — we're tearing down */
      }
    }
    const signals = (signalsKey.split(",") as NodeJS.Signals[]).filter((s) => s.length > 0)
    const unregs: Array<() => void> = []
    for (const sig of signals) {
      const unreg = term.signals?.on(sig, runOnce, {
        priority: priorityRef.current,
        // Names must be unique across the signals registry — suffix with
        // the signal so the same base name can hook multiple signals.
        name: `${nameRef.current}-${sig}`,
      })
      if (unreg) unregs.push(unreg)
    }
    return () => {
      for (const u of unregs) u()
      runOnce()
    }
  }, [term, signalsKey])
}
