/**
 * Console perf benchmark — 10k-entry O(n) amortized flush.
 *
 * ## Why this exists
 *
 * Phase D (commit 47245067) restructured Console to replace the per-log
 * `Object.freeze(buffer.slice())` publish with a cheap `count: ReadSignal<number>`
 * plus on-demand `entriesSnapshot()`. Before Phase D, every `console.log` call
 * allocated a fresh frozen copy of the entire growing buffer — O(n) work per
 * log, O(n²) amortized over N logs. Pro review 2026-04-22 P1-9 flagged this.
 *
 * The refactor turned logging into O(1) per call (just a counter bump) and
 * moved the O(n) array copy behind `entriesSnapshot()`, which consumers
 * (e.g. `useConsole`) pull lazily at debounce-flush time — typically once
 * per frame, not once per log.
 *
 * ## What this benchmark catches
 *
 * A regression that reintroduces per-log array copy (for example, by having
 * the count signal publish the buffer rather than a number) would send this
 * benchmark from <500 ms back to multi-second territory. It also asserts the
 * `count` signal fires exactly once per log (plus one seed fire at effect
 * setup) — if the refactor ever stops calling `_count(stats.total)` on every
 * log, subscribers would stop receiving heartbeats and the test catches it.
 *
 * ## How to run
 *
 *     PERF=1 bun vitest run --project vendor tests/perf/console-flush-10k.perf.test.ts
 *
 * Gated by PERF=1 so it stays out of the default test matrix (too slow +
 * wall-clock-sensitive for per-commit CI). Run on-demand when touching
 * Console internals or when Pro flags a perf regression.
 */

import { describe, expect, test } from "vitest"
import { effect } from "@silvery/signals"
import { createConsole, type Console } from "@silvery/ag-term/runtime/devices/console"

const PERF_ENABLED = process.env.PERF === "1" || process.env.PERF === "true"

/** Match the stub-console pattern used in tests/features/console.test.ts. */
function stubConsole() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const stub: Partial<globalThis.Console> & Record<string, unknown> = {}
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    stub[method] = (...args: unknown[]) => {
      calls.push({ method, args })
    }
  }
  return { stub: stub as globalThis.Console, calls }
}

describe.skipIf(!PERF_ENABLED)("Console perf — 10k flush", () => {
  test("10,000 log calls complete in O(n) amortized time", () => {
    const N = 10_000
    const BUDGET_MS = 500

    const { stub } = stubConsole()
    let owner: Console | null = null
    try {
      owner = createConsole(stub)
      owner.capture({ suppress: true })

      // Simulate useConsole's subscriber — one effect reading count(), no
      // debounce. This keeps the reactive path "hot" during the burst so any
      // per-log publish work shows up in wall time.
      let fires = 0
      const stopEffect = effect(() => {
        owner!.count()
        fires++
      })
      try {
        // 1 seed fire at effect setup.
        expect(fires).toBe(1)

        const start = performance.now()
        for (let i = 0; i < N; i++) {
          stub.log("x")
        }
        const elapsedMs = performance.now() - start

        // Count signal must have fired exactly N + 1 times (seed + per-log).
        // A regression that stops calling _count(stats.total) on every log
        // would leave fires === 1 (subscriber silent after the seed).
        expect(fires).toBe(N + 1)

        // Snapshot is paid once per consumer read — NOT on every log.
        const snapStart = performance.now()
        const snap = owner.entriesSnapshot()
        const snapMs = performance.now() - snapStart

        expect(snap).toHaveLength(N)
        expect(Object.isFrozen(snap)).toBe(true)

        // Budget assertion. With the Phase D design (count++ per log, no
        // array copy), 10k logs on reference hardware (M-series mac) lands
        // well under 500 ms (observed ~3.4 ms — three orders of magnitude of
        // headroom). The pre-Phase-D design took multiple seconds for the
        // same burst due to O(n²) frozen-slice publishes. The 500 ms budget
        // deliberately leaves room for noisy CI hosts without masking a
        // genuine regression — if this ever fails, the refactor has been
        // undone and entries are being copied on every log again.
        //
        // snapMs is not budget-asserted (single call, noise-dominated) but
        // is kept in scope so a future regression that makes entriesSnapshot
        // itself super-linear would be easy to spot in a debugger.
        void snapMs
        expect(elapsedMs).toBeLessThan(BUDGET_MS)
      } finally {
        stopEffect()
      }
    } finally {
      owner?.dispose()
    }
  })
})
