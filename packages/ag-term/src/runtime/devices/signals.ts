/**
 * term.signals — single SignalScope per Term lifetime with topologically-ordered
 * teardown.
 *
 * ## Why
 *
 * The 2026-04-22 shared-global audit found 78 `process.on("SIGINT" | "SIGTERM" |
 * "SIGTSTP" | "SIGWINCH" | "exit" | "beforeExit" | …)` registrations across km
 * + silvery with no documented cleanup order. Handlers fire in registration
 * order. If an earlier handler crashes, the Node.js default behaviour may skip
 * later handlers or the process may exit before their cleanup runs — the same
 * class of resource-leak race that the `wasRaw` finding exposed for raw mode.
 *
 * Signals is the same META-fix as Output / Modes / Input: one owner per Term
 * mediates every registration for a given signal. On dispose (or on signal
 * delivery) handlers fire in priority / dependency order, each wrapped in
 * try/catch so a single failing handler doesn't block the rest.
 *
 * ## API shape
 *
 *   const unregister = term.signals.on("SIGINT", () => closeDb(), {
 *     priority: 10,             // lower = runs first
 *     before: ["flush-logs"],   // or explicit dep graph
 *     after: ["save-state"],
 *     name: "close-db",         // optional handle for before/after
 *   })
 *   term.signals.dispose()       // cascades from term.dispose()
 *
 * `priority` is a simple sort key (number, default 0). `before` / `after`
 * reference handler `name`s. `dispose()` runs every registered handler in
 * topological order, catches errors, and is idempotent.
 *
 * ## Not covered by this owner
 *
 * - `apps/km-tui/src/state/raw-signals.ts::restoreTerminal` stays as the
 *   emergency last-ditch crash handler (runs on `uncaughtException`). It
 *   must run even if the Term (and its Signals) has already been disposed.
 *
 * Bead: km-silvery.term-sub-owners (Phase 6).
 */

/** Process signal / lifecycle event the owner understands. */
export type SignalName = NodeJS.Signals | "exit" | "beforeExit" | "uncaughtException" | "unhandledRejection"

/** Options per registration. */
export interface SignalOnOptions {
  /**
   * Sort key — lower runs first on dispose / signal delivery. Default 0.
   *
   * Rule of thumb:
   *  - 0–9:   app-level cleanup (close DB, cancel pending work)
   *  - 10–19: runtime cleanup (stop schedulers, drain queues)
   *  - 20–29: terminal cleanup (restore modes, leave alt screen)
   *  - 30+:   emergency / last-ditch
   *
   * `before` / `after` take precedence — priority is only a tiebreaker.
   */
  priority?: number

  /**
   * Handler name — required if you want `before`/`after` to reference this
   * handler. If omitted, a unique id is generated.
   */
  name?: string

  /** Handler names that must run AFTER this one. */
  before?: string[]

  /** Handler names that must run BEFORE this one. */
  after?: string[]

  /**
   * If `true`, the handler also runs on `dispose()` (before any process-level
   * signal handler is detached). Default: true — dispose is the primary
   * teardown path.
   */
  onDispose?: boolean

  /**
   * If `true`, the handler runs when the named signal is delivered to the
   * process (via `process.on(signal, …)`). Default: true.
   */
  onSignal?: boolean
}

/**
 * Signals sub-owner.
 *
 * One per Term. Mediates every `process.on(signalName, …)` registration for
 * the Term's lifetime, running handlers in priority/dependency order on
 * signal delivery or on `dispose()`.
 */
export interface Signals extends Disposable {
  /**
   * Register a handler for a process signal or lifecycle event. Returns an
   * unregister function; calling it removes the handler from this owner's
   * registry (does not fire the handler).
   *
   * The first registration for a given signal installs a shared
   * `process.on(signal, …)` listener; subsequent registrations reuse it.
   * `dispose()` removes the shared listener.
   */
  on(signal: SignalName, handler: () => void | Promise<void>, opts?: SignalOnOptions): () => void

  /**
   * Synchronous teardown. Runs every registered handler (with `onDispose:
   * true`, the default) in priority/dependency order, catching errors so one
   * failing handler can't block the rest. Idempotent.
   *
   * Handlers that return Promises are awaited best-effort via a microtask —
   * but `dispose()` itself is synchronous because it runs under `using` /
   * Symbol.dispose semantics, and on signal delivery the process may exit
   * before any async work resolves.
   */
  dispose(): void

  /** True after `dispose()` / `Symbol.dispose` has run. */
  readonly isDisposed: boolean

  /** Number of live registrations across all signals. */
  readonly size: number
}

interface Entry {
  id: string
  name: string
  signal: SignalName
  handler: () => void | Promise<void>
  priority: number
  before: string[]
  after: string[]
  onDispose: boolean
  onSignal: boolean
}

/**
 * Options for `createSignals`.
 */
export interface CreateSignalsOptions {
  /**
   * Override the process-level event source. Tests pass a fake `process`
   * to drive signal delivery without touching real signals.
   * Defaults to Node's `process` global.
   */
  process?: NodeJS.Process

  /**
   * Error hook — called for every handler that throws. Default: swallow.
   * Tests use this to assert isolation semantics.
   */
  onError?: (error: unknown, entry: { name: string; signal: SignalName }) => void
}

/**
 * Create a `Signals` sub-owner. Installs no process-level listeners until the
 * first `on()` call; removes them on `dispose()`.
 */
export function createSignals(opts: CreateSignalsOptions = {}): Signals {
  const proc = opts.process ?? process
  const onError = opts.onError

  let disposed = false
  let nextId = 0

  /** All registrations, regardless of signal. */
  const entries = new Map<string, Entry>()

  /** Shared `process.on(signal, …)` listeners, one per signal. */
  const installed = new Map<SignalName, () => void>()

  function makeId(): string {
    return `signals-${++nextId}`
  }

  function entriesFor(signal: SignalName): Entry[] {
    const out: Entry[] = []
    for (const e of entries.values()) {
      if (e.signal === signal) out.push(e)
    }
    return out
  }

  /**
   * Topological sort of entries respecting `before`/`after` deps, with
   * `priority` as the tiebreaker. Returns entries in the order they should
   * run. Cycles fall back to priority order (cycle edges silently dropped).
   */
  function ordered(subset: Entry[]): Entry[] {
    // Map name → entry for dep resolution.
    const byName = new Map<string, Entry>()
    for (const e of subset) byName.set(e.name, e)

    // Adjacency: edge from A → B means "A must run before B".
    const outgoing = new Map<string, Set<string>>()
    const incoming = new Map<string, number>()
    for (const e of subset) {
      outgoing.set(e.name, new Set())
      incoming.set(e.name, 0)
    }
    for (const e of subset) {
      // `before: ["X"]` — this entry runs before X → edge this → X
      for (const target of e.before) {
        if (!byName.has(target)) continue
        const set = outgoing.get(e.name)!
        if (!set.has(target)) {
          set.add(target)
          incoming.set(target, (incoming.get(target) ?? 0) + 1)
        }
      }
      // `after: ["Y"]` — this entry runs after Y → edge Y → this
      for (const source of e.after) {
        if (!byName.has(source)) continue
        const set = outgoing.get(source)!
        if (!set.has(e.name)) {
          set.add(e.name)
          incoming.set(e.name, (incoming.get(e.name) ?? 0) + 1)
        }
      }
    }

    // Kahn's algorithm, tiebroken by (priority, insertion order via id).
    const byKey = (a: Entry, b: Entry) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    }
    const ready: Entry[] = []
    for (const e of subset) {
      if ((incoming.get(e.name) ?? 0) === 0) ready.push(e)
    }
    ready.sort(byKey)

    const result: Entry[] = []
    const visited = new Set<string>()
    while (ready.length > 0) {
      const next = ready.shift()!
      if (visited.has(next.name)) continue
      visited.add(next.name)
      result.push(next)
      for (const downstream of outgoing.get(next.name) ?? []) {
        const count = (incoming.get(downstream) ?? 0) - 1
        incoming.set(downstream, count)
        if (count === 0) {
          const entry = byName.get(downstream)
          if (entry && !visited.has(entry.name)) {
            ready.push(entry)
            ready.sort(byKey)
          }
        }
      }
    }

    // Cycle fallback — any entry not yet visited gets appended in priority
    // order. Silently tolerates cyclic deps (they're a bug, but we prefer a
    // best-effort teardown over throwing during a crash handler).
    const remaining = subset.filter((e) => !visited.has(e.name)).sort(byKey)
    result.push(...remaining)
    return result
  }

  function runHandlers(list: Entry[]): void {
    for (const entry of list) {
      try {
        const maybe = entry.handler()
        // Async handlers are awaited best-effort — we can't block a sync
        // dispose. Any rejection after this point is caught below; we don't
        // want to hang the crash path on a slow Promise.
        if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
          ;(maybe as Promise<unknown>).catch((err) => {
            if (onError) onError(err, { name: entry.name, signal: entry.signal })
          })
        }
      } catch (err) {
        if (onError) onError(err, { name: entry.name, signal: entry.signal })
      }
    }
  }

  function installIfNeeded(signal: SignalName): void {
    if (installed.has(signal)) return
    const listener = () => {
      if (disposed) return
      const list = ordered(entriesFor(signal).filter((e) => e.onSignal))
      runHandlers(list)
    }
    proc.on(signal, listener)
    installed.set(signal, listener)
  }

  function uninstall(signal: SignalName): void {
    const listener = installed.get(signal)
    if (!listener) return
    try {
      proc.off(signal, listener)
    } catch {
      // process may be exiting
    }
    installed.delete(signal)
  }

  function on(
    signal: SignalName,
    handler: () => void | Promise<void>,
    options: SignalOnOptions = {},
  ): () => void {
    if (disposed) {
      // After dispose, registrations are a no-op — callers that keep a stale
      // owner reference shouldn't accidentally re-install listeners.
      return () => {}
    }
    const id = makeId()
    const entry: Entry = {
      id,
      name: options.name ?? id,
      signal,
      handler,
      priority: options.priority ?? 0,
      before: options.before ?? [],
      after: options.after ?? [],
      onDispose: options.onDispose !== false,
      onSignal: options.onSignal !== false,
    }
    entries.set(id, entry)
    if (entry.onSignal) installIfNeeded(signal)

    return () => {
      entries.delete(id)
      // If this was the last registration for the signal AND no other entries
      // need it for onSignal, drop the shared listener. Rare path — usually
      // dispose() handles the whole batch.
      if (!entriesFor(signal).some((e) => e.onSignal)) {
        uninstall(signal)
      }
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true

    // Run dispose handlers once, across ALL signals, in a single unified
    // topological order. Using one global pass means cross-signal deps
    // (e.g. "restore terminal after close DB") work naturally; callers
    // don't have to remember which signal their handler was registered on.
    const disposalSet = [...entries.values()].filter((e) => e.onDispose)
    const sorted = ordered(disposalSet)
    runHandlers(sorted)

    // Remove every process-level listener we installed.
    for (const signal of [...installed.keys()]) {
      uninstall(signal)
    }

    entries.clear()
  }

  return {
    on,
    dispose,
    get isDisposed() {
      return disposed
    },
    get size() {
      return entries.size
    },
    [Symbol.dispose]: dispose,
  }
}
