/**
 * pass-cause.ts — Renderer feedback-edge instrumentation, loggily-native.
 *
 * Captures the cause of each render/layout pass beyond pass 1. The convergence
 * loop in `renderer.ts` (singlePassLayout / classic) and `create-app.tsx`
 * (processEventBatch flush loop) iterate until `hadReactCommit` is false. Each
 * extra pass is a "feedback edge": some computation in pass N caused React
 * state to change, which forces pass N+1.
 *
 * This module attributes each extra pass to a category (PassCause) and an
 * originating identity (node id, signal name, etc.) so we can answer "what
 * keeps the loop alive?". The data feeds C3b (bounded-convergence) — once we
 * know which feedback edges dominate, we can replace MAX_SINGLE_PASS_ITERATIONS
 * with attributed bounds.
 *
 * ## Design (post dual-pro review, 2026-04-26)
 *
 * Pass-causes are CATEGORICAL events, not duration spans. Both GPT-5.4 Pro
 * and Kimi K2.6 converged on:
 *
 * - Use `log.debug?.("pass", { cause, edge, nodeId, producerPhase })` —
 *   not `log.span()`. Spans imply duration; a pass-cause is instantaneous
 *   and would log spurious 0ms entries that pollute traces.
 * - Aggregate via a custom pipeline `Stage` that captures `LogEvent.props`.
 *   The `Stage` type is part of loggily's public API (`loggily/index.ts`
 *   re-exports it from `./pipeline.js`) — it's the framework's intended
 *   extension point for non-duration aggregation.
 * - Do NOT use `loggily/metrics`. `MetricsCollector` is intentionally
 *   duration-only: `recordSpan(data)` only sees `{name, durationMs}`,
 *   props are dropped at the collector boundary, and `summary()` returns
 *   `"name: N spans, mean=Xms, p50=Yms"`. For pass-causes the durations
 *   would all be ~0ms, and we would lose the edge/node breakdown that
 *   C3b consumes.
 * - Emit on a parent + child sub-namespace (`silvery:passes` and
 *   `silvery:passes:<cause>`) so `DEBUG=silvery:passes:layout-invalidate`
 *   filters by cause without losing the canonical histogram (which reads
 *   from the parent-namespace stage).
 * - Default-off via the silvery-side `SILVERY_INSTRUMENT=1` constant-fold
 *   gate (zero overhead when unset). Setting it also sets the loggily
 *   `LOG_LEVEL=debug` for `silvery:passes` (see logger setup below).
 * - For tests: the aggregator stage is composable; tests can call
 *   `createPassCauseAggregator()` for a fresh aggregator and pass
 *   `.stage` into a test-local `createLogger("silvery:passes", ...)`.
 *
 * Tracking: km-silvery.renderer-feedback-trace, km-silvery.feedback-trace-loggily
 */

import { createLogger, type ConditionalLogger, type Stage, type Event } from "loggily"

/**
 * Categories of feedback edges that can trigger an extra render/layout pass.
 *
 * Subscriber feedback (genuine pass causes):
 * - layout-invalidate: rect signal value changed AND a subscriber consumed
 *   it (gated on `hasLayoutSignals(node)` — see notifyLayoutSubscribers).
 *
 * Measure-phase feedback (text/intrinsic-size loops):
 * - wrap-reflow: width/viewport-dependent line breaking changed text size.
 * - intrinsic-shrinkwrap: fit-content / snug-content / min-content sizing
 *   changed parent dimensions.
 * - font-metrics-changed: cell metrics / font fallback / theme density
 *   altered glyph widths.
 *
 * Layout side-effects:
 * - scrollto-settle: scrollTo prop change forced an offset adjustment.
 * - sticky-resettle: sticky child offsets caused another pass.
 * - decoration-remap: anchored decorations changed measure inputs.
 * - focus-scroll-into-view: focus manager fired a programmatic scroll.
 *
 * Async / external metadata:
 * - async-image-size: late-arriving image dimensions invalidated layout.
 * - theme-metric-changed: theme tokens affecting space/cell-size/border
 *   thickness changed mid-frame.
 *
 * Convergence-loop / external triggers (depth-0; not feedback per se):
 * - viewport-resize: terminal dims changed; treated as a root trigger.
 *
 * Synthesized:
 * - unknown: pass committed React work but no specific cause was emitted
 *   (synthesized by `notePassCommit`). Observed at 0.006% of records in
 *   the v2/v3 baseline corpus, confirming the enum is essentially
 *   exhaustive for the wired emit sites.
 */
export type PassCause =
  // Subscriber-observed rect changes (gated to actual subscribers)
  | "layout-invalidate"
  // Measure-phase feedback
  | "wrap-reflow"
  | "intrinsic-shrinkwrap"
  | "font-metrics-changed"
  // Layout side-effects
  | "scrollto-settle"
  | "sticky-resettle"
  | "decoration-remap"
  | "focus-scroll-into-view"
  // Async / external
  | "async-image-size"
  | "theme-metric-changed"
  // Root triggers (depth-0)
  | "viewport-resize"
  // Synthesized
  | "unknown"

/** Phase that produced the feedback edge. */
export type ProducerPhase =
  | "measure"
  | "layout"
  | "scroll"
  | "sticky"
  | "scrollrect"
  | "decoration"
  | "content"
  | "output"
  | "renderer"
  | "react-effect"

export interface PassCauseRecord {
  cause: PassCause
  /** Originating node id (or other stable identity). */
  nodeId?: string | number
  /** Edge name (e.g. signal name, prop name). */
  edge?: string
  /** Pipeline phase that produced the feedback. */
  producerPhase?: ProducerPhase
  /** Free-form detail (kept short — not for prose). */
  detail?: string
}

export interface PassHistogramEntry {
  cause: PassCause
  count: number
  topEdges: { edge: string; count: number }[]
  topNodes: { nodeId: string | number; count: number }[]
}

export interface PassHistogram {
  totalRecords: number
  perPass: number[]
  byCause: PassHistogramEntry[]
}

/**
 * Module-level instrumentation gate. Constant so JS engines can fold the
 * `if (INSTRUMENT) { ... }` blocks at every emit site out of the hot path.
 *
 * Mapping to loggily:
 * - SILVERY_INSTRUMENT=1 implies LOG_LEVEL=debug + DEBUG=silvery:passes
 *   for the silvery:passes namespace, so the loggily pipeline accepts
 *   debug-level events (default level is info, which would drop them).
 *
 * The two gates compose:
 * - INSTRUMENT controls the silvery side (emit-call evaluation, prop
 *   allocation).
 * - DEBUG/LOG_LEVEL controls the loggily side (which sinks/stages see
 *   the event).
 */
export const INSTRUMENT = process.env.SILVERY_INSTRUMENT === "1"
const instrumentEnabled = INSTRUMENT

// Note on env-var mapping: an earlier draft auto-set DEBUG=silvery:passes
// when SILVERY_INSTRUMENT=1 for one-switch UX, but that broke ~4 vendor
// tests in `box-in-text-warning` / `input-owner` that intercept
// `console.warn`. Setting DEBUG globally appears to interact with how
// silvery routes warn output through the dev-debug pipeline. Keep the two
// switches independent: SILVERY_INSTRUMENT controls the silvery-side gate
// (no overhead when off); DEBUG=silvery:passes (or :<cause>) controls the
// loggily-side filter when the user wants to additionally pipe events to
// console. The aggregator stage doesn't need DEBUG to be set — it's
// always wired into the pipeline.

/** True when the SILVERY_INSTRUMENT env var is set to "1". */
export function isInstrumentEnabled(): boolean {
  return instrumentEnabled
}

// =============================================================================
// Aggregator — captures categorical pass-cause data from log events.
// =============================================================================

interface AggregatorState {
  records: PassCauseRecord[]
  perPass: number[]
}

/**
 * Pipeline-stage-shaped aggregator. The `stage` is attached to a loggily
 * pipeline; it captures `pass` events emitted under the `silvery:passes`
 * namespace into its categorical store.
 *
 * Tests can construct fresh aggregators and attach them to test loggers;
 * the module's default singleton `passAggregator` is what production
 * (and the vitest setup) uses.
 */
export interface PassCauseAggregator {
  /** Loggily pipeline stage — attach to logger config to capture events. */
  readonly stage: Stage
  /** Snapshot the current histogram. */
  getHistogram(): PassHistogram
  /** Format histogram as a human-readable summary. */
  formatSummary(): string
  /** Clear all captured records. */
  reset(): void
  /** Record a per-pass-index commit (so we know convergence depth). */
  notePassCommit(passIndex: number): void
  /** Mark the start of a pass (used for unknown synthesis). */
  beginPass(passIndex: number): void
  /** Reset before a fresh convergence loop. */
  beginConvergenceLoop(): void
  /** Append a JSON snapshot to a file (test-runner exit hook). */
  appendJson(file: string): void
}

export function createPassCauseAggregator(): PassCauseAggregator {
  let state: AggregatorState = { records: [], perPass: [] }
  let recordsAtPassStart = 0

  const stage: Stage = (event: Event): Event => {
    // Match parent (`silvery:passes`) and child (`silvery:passes:<cause>`)
    // namespaces — emit happens on the child namespace so that
    // `DEBUG=silvery:passes:layout-invalidate` filters by cause.
    if (event.kind !== "log") return event
    if (
      event.namespace !== "silvery:passes" &&
      !event.namespace.startsWith("silvery:passes:")
    ) {
      return event
    }
    if (event.message !== "pass") return event
    const props = event.props as Partial<PassCauseRecord> | undefined
    if (!props?.cause) return event
    state.records.push({
      cause: props.cause,
      nodeId: props.nodeId,
      edge: props.edge,
      producerPhase: props.producerPhase,
      detail: props.detail,
    })
    return event
  }

  function getHistogram(): PassHistogram {
    const byCauseMap = new Map<
      PassCause,
      {
        count: number
        edges: Map<string, number>
        nodes: Map<string | number, number>
      }
    >()
    for (const r of state.records) {
      let entry = byCauseMap.get(r.cause)
      if (!entry) {
        entry = { count: 0, edges: new Map(), nodes: new Map() }
        byCauseMap.set(r.cause, entry)
      }
      entry.count += 1
      if (r.edge) entry.edges.set(r.edge, (entry.edges.get(r.edge) ?? 0) + 1)
      if (r.nodeId !== undefined) {
        entry.nodes.set(r.nodeId, (entry.nodes.get(r.nodeId) ?? 0) + 1)
      }
    }
    const byCause: PassHistogramEntry[] = []
    for (const [cause, entry] of byCauseMap) {
      const topEdges = [...entry.edges.entries()]
        .map(([edge, count]) => ({ edge, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
      const topNodes = [...entry.nodes.entries()]
        .map(([nodeId, count]) => ({ nodeId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
      byCause.push({ cause, count: entry.count, topEdges, topNodes })
    }
    byCause.sort((a, b) => b.count - a.count)
    return {
      totalRecords: state.records.length,
      perPass: state.perPass.slice(),
      byCause,
    }
  }

  function formatSummary(): string {
    const h = getHistogram()
    if (h.totalRecords === 0) return "pass-cause histogram: no extra passes recorded"
    const lines: string[] = []
    lines.push(`pass-cause histogram: ${h.totalRecords} extra-pass causes`)
    if (h.perPass.length > 0) {
      const perPassLine = h.perPass
        .map((c, i) => (c > 0 ? `pass${i}=${c}` : null))
        .filter((s) => s !== null)
        .join(" ")
      if (perPassLine) lines.push(`  per-pass commits: ${perPassLine}`)
    }
    for (const entry of h.byCause) {
      const pct = ((entry.count / h.totalRecords) * 100).toFixed(1)
      lines.push(`  ${entry.cause}: ${entry.count} (${pct}%)`)
      if (entry.topEdges.length > 0) {
        lines.push(
          "    edges: " + entry.topEdges.map((e) => `${e.edge}×${e.count}`).join(", "),
        )
      }
      if (entry.topNodes.length > 0) {
        lines.push(
          "    nodes: " + entry.topNodes.map((n) => `${n.nodeId}×${n.count}`).join(", "),
        )
      }
    }
    return lines.join("\n")
  }

  function reset(): void {
    state = { records: [], perPass: [] }
    recordsAtPassStart = 0
  }

  function notePassCommit(passIndex: number): void {
    while (state.perPass.length <= passIndex) state.perPass.push(0)
    state.perPass[passIndex] = (state.perPass[passIndex] ?? 0) + 1
    // If no specific cause was emitted between beginPass and notePassCommit,
    // synthesize an "unknown" record. This converts "no data for this pass"
    // into observable signal — C3b can read the unknown count to know
    // whether the enum is missing categories for some commit-causing edge.
    if (state.records.length === recordsAtPassStart) {
      state.records.push({
        cause: "unknown",
        detail: `pass-${passIndex}-uncategorized-commit`,
      })
    }
  }

  function beginPass(_passIndex: number): void {
    recordsAtPassStart = state.records.length
  }

  function beginConvergenceLoop(): void {
    recordsAtPassStart = state.records.length
  }

  function appendJson(file: string): void {
    const h = getHistogram()
    if (h.totalRecords === 0) return
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs")
    fs.appendFileSync(file, JSON.stringify(h) + "\n")
  }

  return {
    stage,
    getHistogram,
    formatSummary,
    reset,
    notePassCommit,
    beginPass,
    beginConvergenceLoop,
    appendJson,
  }
}

// =============================================================================
// Module-singleton logger + aggregator.
// =============================================================================
//
// Wired together at module load. The logger's pipeline includes:
//   - level: debug for the silvery:passes namespace
//   - the aggregator stage (which captures categorical data)
//
// Default behaviour (SILVERY_INSTRUMENT unset): the aggregator stage is
// still wired in but no events ever reach it because emit sites are gated
// by INSTRUMENT.
//
// When SILVERY_INSTRUMENT=1, emit sites call `passLog.debug?.("pass", ...)`
// and loggily's pipeline routes the event through the aggregator stage.

const passAggregator = createPassCauseAggregator()

/** The singleton aggregator — used by tests and tooling to read counts. */
export function getPassAggregator(): PassCauseAggregator {
  return passAggregator
}

/**
 * Pass-cause loggers. Parent namespace is `silvery:passes`. Each cause gets
 * a child namespace `silvery:passes:<cause>` so users can filter at any
 * granularity:
 *   DEBUG=silvery:passes                    → all causes
 *   DEBUG=silvery:passes:layout-invalidate  → only layout-invalidate
 *   DEBUG=silvery:passes:scrollto-settle    → only scrollto-settle
 *
 * Both the parent and every child share the same pipeline (level + the
 * aggregator stage). Children are cached on first use to avoid logger
 * construction in the hot path.
 *
 * The aggregator stage is always attached — it's a no-op when no events
 * arrive, and the INSTRUMENT gate at emit sites prevents events when the
 * env var is unset.
 */
const passLogConfig = [
  // When SILVERY_INSTRUMENT=1, raise this namespace's level to debug so
  // emit sites' `?.debug` calls actually dispatch.
  { level: instrumentEnabled ? "debug" : "info" } as const,
  passAggregator.stage,
] as const

const passLog: ConditionalLogger = createLogger("silvery:passes", [
  ...passLogConfig,
])

const childLoggers = new Map<PassCause, ConditionalLogger>()
function loggerForCause(cause: PassCause): ConditionalLogger {
  let child = childLoggers.get(cause)
  if (!child) {
    child = createLogger(`silvery:passes:${cause}`, [...passLogConfig])
    childLoggers.set(cause, child)
  }
  return child
}

// =============================================================================
// Public API — back-compat shape preserved so existing call sites in
// renderer.ts / layout-phase.ts / measure-phase.ts / runtime/renderer.ts /
// runtime/create-app.tsx don't need to change.
// =============================================================================

/**
 * Reset the per-loop pass-index tracker. Called at the top of each
 * convergence loop in renderer.ts / runtime/create-app.tsx.
 */
export function beginConvergenceLoop(): void {
  if (!instrumentEnabled) return
  passAggregator.beginConvergenceLoop()
}

/** Mark the start of pass N (0-based). */
export function beginPass(passIndex: number): void {
  if (!instrumentEnabled) return
  passAggregator.beginPass(passIndex)
}

/**
 * Record that a feedback edge fired during the current pass.
 *
 * Emits on the per-cause child namespace so that
 * `DEBUG=silvery:passes:<cause>` filters by cause; the aggregator stage
 * captures both parent and child events into the canonical histogram.
 */
export function logPass(record: PassCauseRecord): void {
  if (!instrumentEnabled) return
  const log = loggerForCause(record.cause)
  log.debug?.("pass", record as unknown as Record<string, unknown>)
}

/**
 * Re-export of the parent-namespace logger for callers that need to emit
 * generic `silvery:passes`-namespaced messages (e.g. tooling that reads
 * DEBUG=silvery:passes for an aggregate trace).
 */
export function getPassLog(): ConditionalLogger {
  return passLog
}

/**
 * Mark that pass N committed React work that will require pass N+1.
 * Bumps the per-pass-index counter and synthesizes an "unknown" record
 * if no specific cause was emitted during pass N.
 */
export function notePassCommit(passIndex: number): void {
  if (!instrumentEnabled) return
  passAggregator.notePassCommit(passIndex)
}

/** Snapshot the current pass-cause histogram. */
export function getPassHistogram(): PassHistogram {
  if (!instrumentEnabled) {
    return { totalRecords: 0, perPass: [], byCause: [] }
  }
  return passAggregator.getHistogram()
}

/** Clear all captured records. */
export function resetPassHistogram(): void {
  passAggregator.reset()
}

/** Format the histogram as a one-screen text summary. */
export function formatPassHistogram(_h?: PassHistogram): string {
  return passAggregator.formatSummary()
}

/**
 * Print histogram to stderr (test runner / app teardown). No-op if
 * instrumentation is disabled or no records exist.
 *
 * In test environments where stdout/stderr are intercepted, write to
 * SILVERY_INSTRUMENT_FILE instead.
 */
export function printPassHistogram(): void {
  if (!instrumentEnabled) return
  const h = passAggregator.getHistogram()
  if (h.totalRecords === 0) return
  const formatted = passAggregator.formatSummary()
  const file = process.env.SILVERY_INSTRUMENT_FILE
  if (file) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs")
    fs.appendFileSync(file, "\n" + formatted + "\n")
    return
  }
  process.stderr.write("\n" + formatted + "\n")
}

/** Append a JSON snapshot to a file (vitest exit hook). */
export function appendHistogramJson(file: string): void {
  if (!instrumentEnabled) return
  passAggregator.appendJson(file)
}
