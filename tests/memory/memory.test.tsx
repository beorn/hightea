/**
 * Memory Tests for Silvery
 *
 * Bead: km-silvery.memory-test
 *
 * Validates that silvery does not leak memory under sustained usage:
 * - Re-renders with bounded heap growth (proportional to frame count)
 * - Mount/unmount cycles with bounded growth
 * - useBoxRect subscription cleanup (no leaked listeners)
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, render, getActiveRenderCount } from "@silvery/test"
import { Box, Text, useBoxRect } from "@silvery/ag-react"
import {
  SimpleBox,
  Counter,
  ResponsiveBox,
  MountUnmountCycle,
  ComplexLayout,
} from "../fixtures/index.tsx"

// ============================================================================
// Helpers
// ============================================================================

/** Measure heap usage after forced GC (if available). */
function getHeapUsedMB(): number {
  // Force a synchronous full GC. Bun exposes `Bun.gc(true)` for this; Node.js
  // exposes `global.gc` only when launched with `--expose-gc`. Without one
  // of these, heap measurements drift up just from chunky allocator behavior
  // and never reflect what's actually retained — which is what the memory
  // budget here is supposed to measure.
  //
  // We call gc() three times because Bun's collector does not always release
  // every reachable-via-finalizer object in a single pass: WeakMap-backed
  // signal entries, useBoxRect effects, and React fiber slots clear in waves.
  // A single `gc(true)` leaves 10–25 MB on the heap that a second pass
  // reclaims; the third pass is insurance for the rare third wave.
  const b = (globalThis as { Bun?: { gc(sync: boolean): void } }).Bun
  if (b?.gc) {
    b.gc(true)
    b.gc(true)
    b.gc(true)
  } else if (typeof globalThis.gc === "function") {
    globalThis.gc()
    globalThis.gc()
  }
  return process.memoryUsage().heapUsed / (1024 * 1024)
}

/**
 * Run a workload a few times to warm JIT, allocator chunks, theme/cache pools,
 * and React fiber-root allocators. Without this, the first ~50-100 mount/render
 * cycles inflate the heap by 15-40 MB just because the allocator hasn't reached
 * steady state. Calling this before `heapBefore` lets us measure real retention,
 * not first-touch overhead.
 */
function warmup(fn: () => void, iters = 50): void {
  for (let i = 0; i < iters; i++) fn()
}

/**
 * Track the peak heap delta during a workload. Calls `Bun.gc(true)` every
 * `interval` iters and records the largest growth observed. This is the
 * correct way to assert "no retention leak" — without intermediate GC calls,
 * transient allocations from React commits + Ag pipelines accumulate faster
 * than the collector's wall-clock budget allows it to run, so the post-loop
 * heap reading inflates by 20-40 MB even when steady state is bounded. The
 * peak captures the "did this actually leak across iterations" signal.
 *
 * Returns `[peakDelta, finalDelta]` so callers can assert on either.
 */
function runWithPeakTracking(
  iters: number,
  body: (i: number) => void,
  options: { interval?: number } = {},
): { peak: number; final: number } {
  const interval = options.interval ?? 50
  const heapBefore = getHeapUsedMB()
  let peak = 0
  for (let i = 0; i < iters; i++) {
    body(i)
    if (i % interval === interval - 1) {
      const delta = getHeapUsedMB() - heapBefore
      if (delta > peak) peak = delta
    }
  }
  const final = getHeapUsedMB() - heapBefore
  return { peak: Math.max(peak, final), final }
}

// ============================================================================
// Re-render Tests
// ============================================================================

describe("memory: rapid re-renders", () => {
  test("1000 re-renders via rerender() stay bounded", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ComplexLayout))

    // Warm up rerender path before measuring.
    for (let i = 0; i < 50; i++) {
      app.rerender(React.createElement(ComplexLayout))
    }

    const { peak } = runWithPeakTracking(1000, () => {
      app.rerender(React.createElement(ComplexLayout))
    })

    // Verify it rendered correctly
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Header")

    // frames array stores all frame strings; growth is proportional.
    // 1000 frames * ~5KB each = ~5MB for frame strings alone.
    // Allow 20MB total to account for GC timing and React internals.
    expect(peak).toBeLessThan(20)
  })

  test("frames array grows linearly with press count", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(Counter))

    // Each press() appends a frame
    for (let i = 0; i < 100; i++) {
      await app.press("j")
    }

    // frames array tracks all renders — verify it's there and linear
    // (1 initial + 100 presses = 101)
    expect(app.frames.length).toBe(101)
  })
})

// ============================================================================
// Mount/Unmount Cycle Tests
// ============================================================================

describe("memory: mount/unmount cycles", () => {
  test("200 mount/unmount cycles with bounded growth", { timeout: 30_000 }, () => {
    // Warm up allocator + JIT before measuring — see warmup() docs.
    warmup(() => {
      const app = render(React.createElement(MountUnmountCycle, { visible: true }), {
        cols: 80,
        rows: 24,
      })
      app.unmount()
    })

    const { peak } = runWithPeakTracking(200, () => {
      const app = render(React.createElement(MountUnmountCycle, { visible: true }), {
        cols: 80,
        rows: 24,
      })
      // Verify it rendered
      expect(app.text).toContain("Mounted Component")
      app.unmount()
    })

    // 200 post-warmup cycles with cleanup should not grow more than 15MB.
    // Steady state is typically 0-2 MB (no genuine retention); the 15 MB
    // budget covers GC timing slack for chunky allocator behavior.
    expect(peak).toBeLessThan(15)
  })

  test("createRenderer auto-unmounts previous render", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    for (let i = 0; i < 200; i++) {
      // Each call unmounts the previous one automatically
      r(React.createElement(SimpleBox, { label: `Item ${i}` }))
    }

    // After all renders, only one should be active
    // (the last one created by createRenderer)
    const lastApp = r(React.createElement(SimpleBox, { label: "Final" }))
    expect(lastApp.text).toContain("Final")
  })

  test("no active render leak after explicit unmount", () => {
    const initialCount = getActiveRenderCount()

    const app = render(React.createElement(SimpleBox), { cols: 80, rows: 24 })
    expect(getActiveRenderCount()).toBe(initialCount + 1)

    app.unmount()
    expect(getActiveRenderCount()).toBe(initialCount)
  })

  test("mount/unmount with nested components cleans up properly", () => {
    const renderNested = (i: number) =>
      render(
        React.createElement(
          Box,
          { flexDirection: "column" },
          React.createElement(ComplexLayout),
          React.createElement(SimpleBox, { label: `Iteration ${i}` }),
        ),
        { cols: 80, rows: 24 },
      )

    // Warm up allocator + JIT.
    warmup(() => {
      const app = renderNested(-1)
      app.unmount()
    })

    const { peak } = runWithPeakTracking(100, (i) => {
      const app = renderNested(i)
      expect(app.text).toContain("Sidebar")
      app.unmount()
    })

    expect(peak).toBeLessThan(15)
  })
})

// ============================================================================
// useBoxRect Subscription Cleanup
// ============================================================================

describe("memory: useBoxRect cleanup", () => {
  test("useBoxRect subscriptions are cleaned up on unmount", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    // Cycle through many mount/unmount of ResponsiveBox
    // If subscriptions leaked, we'd see errors or massive memory growth
    for (let i = 0; i < 100; i++) {
      r(React.createElement(ResponsiveBox))
      r(React.createElement(SimpleBox))
    }

    // Verify the last render works correctly
    const app = r(React.createElement(SimpleBox, { label: "End" }))
    expect(app.text).toContain("End")
  })

  test("useBoxRect with resize does not leak", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ResponsiveBox))

    // Verify initial render includes size info
    expect(app.text).toContain("Size:")

    // Resize many times — should not accumulate leaked subscriptions
    for (let i = 0; i < 100; i++) {
      const cols = 40 + (i % 80)
      const rows = 10 + (i % 30)
      app.resize(cols, rows)
    }

    // Should still render correctly after many resizes
    expect(app.text).toContain("Size:")
  })

  /** Component that mounts/unmounts useBoxRect users dynamically. */
  function DynamicBoxRect({ showInner }: { showInner: boolean }) {
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Outer"),
      showInner ? React.createElement(ResponsiveBox) : null,
    )
  }

  test("dynamic mount/unmount of useBoxRect components", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    // Warmup — useBoxRect's first ~50 mounts pay JIT + allocator costs that
    // overshadow per-iter retention. Without this, the first 200 iters look
    // like 16 MB growth even though steady-state is 0 MB. Same loop pattern
    // as the measurement loop below.
    warmup(() => {
      const app = r(React.createElement(DynamicBoxRect, { showInner: true }))
      app.rerender(React.createElement(DynamicBoxRect, { showInner: false }))
      app.rerender(React.createElement(DynamicBoxRect, { showInner: true }))
    })

    const { peak } = runWithPeakTracking(200, () => {
      const app = r(React.createElement(DynamicBoxRect, { showInner: true }))
      expect(app.text).toContain("Size:")

      // Rerender without the inner component
      app.rerender(React.createElement(DynamicBoxRect, { showInner: false }))
      expect(app.text).not.toContain("Size:")

      // Rerender with it again
      app.rerender(React.createElement(DynamicBoxRect, { showInner: true }))
      expect(app.text).toContain("Size:")
    })

    // 200 post-warmup cycles of mount/unmount with useBoxRect.
    // Steady state is typically 0-2 MB; budget covers GC timing slack.
    expect(peak).toBeLessThan(15)
  })

  test("rapid rerender of useBoxRect component does not leak", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ResponsiveBox))

    // Warm up rerender path.
    for (let i = 0; i < 50; i++) {
      app.rerender(React.createElement(ResponsiveBox))
    }

    const { peak } = runWithPeakTracking(500, () => {
      app.rerender(React.createElement(ResponsiveBox))
    })

    // 500 post-warmup rerenders of useBoxRect component should stay bounded
    expect(peak).toBeLessThan(15)
    expect(app.text).toContain("Size:")
  })
})
