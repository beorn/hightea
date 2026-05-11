/**
 * Contract: test harness honors `MAX_CONVERGENCE_PASSES` on first paint.
 *
 * Bead: `@km/silvery/test-harness-convergence-cap-parity`.
 *
 * Background. Production silvery runtime caps layout convergence at
 * `MAX_CONVERGENCE_PASSES` per event batch (currently 2 — see
 * `vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts`). Layout
 * chains that need 3+ commits to converge — e.g. ListView's
 * `outer onLayout → setOuterViewportSize → render → inner onLayout →
 * setViewportSize → render → onMeasuredItem → state → render` — settle
 * one pass late. Visible symptoms: scrollbar invisible until first
 * prompt submit, `handleWheel` drops events at `maxRow <= 0`, etc.
 *
 * Pre-fix, the test renderer used `INITIAL_RENDER_MAX_PASSES = 5` on its
 * initial render — so tests over-settled relative to production. Tests
 * saw post-convergence state that real users NEVER get on first paint;
 * bugs that fire only during the first 1-2 passes were invisible.
 *
 * Post-fix, the test harness uses the same `MAX_CONVERGENCE_PASSES` cap
 * production uses. Tests asserting post-convergence state opt in
 * explicitly via `await app.waitForLayoutStable()` — the primitive
 * forces test authors to think about whether their assertion belongs at
 * first paint or post-convergence.
 *
 * See `tests/contracts/README.md` for the convention.
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
// Top-level await in @silvery/test initializes the default layout engine.
import "../../packages/test/src/index.js"
import { createRenderer } from "../../packages/ag-term/src/renderer"
import { Box, Text } from "../../src/index.js"

// ============================================================================
// Contract 1: first-paint cap matches production
// ============================================================================
//
// Render a component whose layout is settled by the first commit boundary
// (no convergence chain at all). Verify the renderer produces a frame
// without throwing or exhausting the cap — establishes the happy path.

describe("contract: createRenderer respects MAX_CONVERGENCE_PASSES on first paint", () => {
  test("contract: simple layouts paint on first commit (no extra settle needed)", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Text>hello</Text>)
    expect(app.text).toContain("hello")
    app.unmount()
  })

  test("contract: multi-pass settle stays bounded — no throw on flexGrow chain", () => {
    // A flexGrow nested layout used to need extra passes when measurement
    // hooks were involved. With layout-signals it settles in ≤ MAX_CONVERGENCE_PASSES.
    // The render must complete without the renderer's internal
    // `assertBoundedConvergence` throwing — STRICT mode is on by default.
    const render = createRenderer({ cols: 60, rows: 20 })
    expect(() => {
      render(
        <Box width={60} height={20} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <Text>content</Text>
          </Box>
        </Box>,
      )
    }).not.toThrow()
  })
})

// ============================================================================
// Contract 2: waitForLayoutStable drains until stable
// ============================================================================
//
// Render an app with a deferred measurement chain that needs additional
// commits beyond MAX_CONVERGENCE_PASSES. Verify:
//   1. The first-paint frame does NOT contain the post-convergence text
//      (the production timing — real users see this state on first paint).
//   2. After `await app.waitForLayoutStable()`, the additional commits
//      have run and the post-convergence text IS visible.

describe("contract: waitForLayoutStable drains additional commits", () => {
  test("contract: waitForLayoutStable resolves and exposes post-convergence text", async () => {
    // Build a component that needs an extra commit beyond the initial render
    // to reach steady state. A setTimeout in useEffect is the canonical
    // way to schedule a deferred React commit that the renderer's auto-render
    // path catches — but for this contract we use createRenderer's autoRender
    // flag is OFF by default, so the deferred state is observable only after
    // waitForLayoutStable cycles through the pending React work.
    //
    // We use a useState + microtask pattern: the initial render shows
    // "pending"; after a microtask + setState, the next commit shows "ready".
    function DeferredText(): React.ReactElement {
      const [phase, setPhase] = useState("pending")
      useEffect(() => {
        // Schedule a state change via microtask — picked up by
        // waitForLayoutStable's drain loop, not by initial render's bounded
        // settle.
        queueMicrotask(() => setPhase("ready"))
      }, [])
      return <Text>{phase}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24, autoRender: true })
    const app = render(<DeferredText />)

    // Before waitForLayoutStable, the deferred commit hasn't run yet.
    // Note: createRenderer doesn't auto-render on async commits without
    // `autoRender: true`. The initial render captured "pending"; the
    // microtask hasn't fired in this synchronous turn.
    expect(app.text).toContain("pending")

    // After waitForLayoutStable, the microtask has drained, setState has
    // committed, and the next render shows "ready".
    await app.waitForLayoutStable()
    expect(app.text).toContain("ready")

    app.unmount()
  })

  test("contract: waitForLayoutStable on a stable tree is a fast no-op", async () => {
    // A tree that has no pending work resolves immediately — the loop
    // exits on the first stability check. This is the common case for
    // tests that call waitForLayoutStable defensively.
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Text>stable</Text>)
    const start = performance.now()
    await app.waitForLayoutStable()
    const elapsed = performance.now() - start
    // Generous bound — the test only cares that we didn't burn the
    // entire 50ms default budget on a stable tree. 25ms gives plenty of
    // headroom for CI slowness without admitting non-fast-path behavior.
    expect(elapsed).toBeLessThan(25)
    expect(app.text).toContain("stable")
    app.unmount()
  })
})

// ============================================================================
// Contract 3: waitForLayoutStable respects timeoutMs cap (non-converging app)
// ============================================================================
//
// An intentionally non-converging app — useState in render that flips on
// every commit — would loop forever if `waitForLayoutStable` didn't enforce
// a cap. Assert the method resolves at the cap WITHOUT throwing.

describe("contract: waitForLayoutStable bounds infinite-feedback gracefully", () => {
  test("contract: non-converging app resolves at the timeoutMs cap (no infinite loop)", async () => {
    // The classic infinite-feedback shape: render-time state mutation.
    // React + the test renderer's STRICT mode would normally throw on a
    // genuinely infinite chain (assertBoundedConvergence), but this
    // primitive is structured to drain WITHOUT throwing — the contract is
    // "best effort within budget."
    //
    // We use a maxPasses cap (lower than the default 20) to make the test
    // fast and deterministic. The point is that the method RESOLVES.
    function FlipFlopBox(): React.ReactElement {
      const [count, setCount] = useState(0)
      useEffect(() => {
        // Schedule another commit every effect — would loop forever
        // without a cap. The cap stops the test renderer's drain loop
        // from being wedged.
        if (count < 1000) {
          queueMicrotask(() => setCount(count + 1))
        }
      }, [count])
      return <Text>flip-flop: {count}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24, autoRender: true })
    const app = render(<FlipFlopBox />)

    const start = performance.now()
    // Pass an explicit (small) cap to keep the test fast — we don't want
    // to wait 50ms when 10ms is enough to prove the bound holds.
    await app.waitForLayoutStable({ timeoutMs: 30, maxPasses: 10 })
    const elapsed = performance.now() - start

    // Resolves — no throw. Bounded by the smaller of timeoutMs / maxPasses.
    // 50ms is a generous upper bound that comfortably absorbs CI variance
    // while still proving we didn't run unbounded.
    expect(elapsed).toBeLessThan(50)
    app.unmount()
  })
})
