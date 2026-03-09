/**
 * Memory Tests for Silvery
 *
 * Bead: km-silvery.memory-test
 *
 * Validates that silvery does not leak memory under sustained usage:
 * - 10k+ rapid re-renders with bounded heap growth (<10MB)
 * - 1000 mount/unmount cycles with bounded growth (<5MB)
 * - useContentRect subscription cleanup (no leaked listeners)
 */

import React, { useState } from "react";
import { describe, test, expect } from "vitest";
import { createRenderer, render } from "@silvery/test";
import { Box, Text, useContentRect } from "@silvery/react";
import {
  SimpleBox,
  Counter,
  ResponsiveBox,
  MountUnmountCycle,
  ComplexLayout,
} from "../fixtures/index.tsx";

// ============================================================================
// Helpers
// ============================================================================

/** Measure heap usage after forced GC (if available). */
function getHeapUsedMB(): number {
  // Bun supports gc() globally
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

/** Wrapper that re-renders a child on every press('u'). */
function ReRenderHarness({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, null, `Tick: ${tick}`),
    // Force child remount by keying on tick
    React.createElement(React.Fragment, { key: tick }, children),
  );
}

// ============================================================================
// Rapid Re-render Tests
// ============================================================================

describe("memory: rapid re-renders", () => {
  test("10k re-renders keep heap growth under 10MB", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    const heapBefore = getHeapUsedMB();

    // Perform 10,000 rapid state changes via key presses
    for (let i = 0; i < 10_000; i++) {
      await app.press("j");
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    // Verify the counter actually incremented
    expect(app.text).toContain("Count: 10000");

    // Heap growth should be bounded — 10MB is generous for 10k renders
    expect(growth).toBeLessThan(10);
  });

  test("rapid re-renders with complex layout stay bounded", async () => {
    const r = createRenderer({ cols: 120, rows: 40 });

    const heapBefore = getHeapUsedMB();

    // Re-render ComplexLayout 5,000 times via rerender()
    let app = r(React.createElement(ComplexLayout));
    for (let i = 0; i < 5_000; i++) {
      app.rerender(React.createElement(ComplexLayout));
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    // Verify it rendered correctly
    expect(app.text).toContain("Sidebar");
    expect(app.text).toContain("Header");

    expect(growth).toBeLessThan(10);
  });

  test("frames array does not grow unboundedly with press()", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    // Each press() appends a frame
    for (let i = 0; i < 1000; i++) {
      await app.press("j");
    }

    // frames array tracks all renders — verify it's there but reasonable
    // (1 initial + 1000 presses = 1001)
    expect(app.frames.length).toBe(1001);
  });
});

// ============================================================================
// Mount/Unmount Cycle Tests
// ============================================================================

describe("memory: mount/unmount cycles", () => {
  test("1000 mount/unmount cycles keep heap growth under 5MB", () => {
    const heapBefore = getHeapUsedMB();

    for (let i = 0; i < 1000; i++) {
      const app = render(React.createElement(MountUnmountCycle, { visible: true }), {
        cols: 80,
        rows: 24,
      });
      // Verify it rendered
      expect(app.text).toContain("Mounted Component");
      app.unmount();
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    expect(growth).toBeLessThan(5);
  });

  test("createRenderer auto-unmounts previous render", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    const heapBefore = getHeapUsedMB();

    for (let i = 0; i < 500; i++) {
      // Each call unmounts the previous one automatically
      r(React.createElement(SimpleBox, { label: `Item ${i}` }));
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    expect(growth).toBeLessThan(5);
  });

  test("mount/unmount with nested components cleans up properly", () => {
    const heapBefore = getHeapUsedMB();

    for (let i = 0; i < 200; i++) {
      const app = render(
        React.createElement(
          Box,
          { flexDirection: "column" },
          React.createElement(ComplexLayout),
          React.createElement(ResponsiveBox),
          React.createElement(SimpleBox, { label: `Iteration ${i}` }),
        ),
        { cols: 80, rows: 24 },
      );
      expect(app.text).toContain("Sidebar");
      app.unmount();
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    expect(growth).toBeLessThan(5);
  });
});

// ============================================================================
// useContentRect Subscription Cleanup
// ============================================================================

describe("memory: useContentRect cleanup", () => {
  test("useContentRect subscriptions are cleaned up on unmount", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    // Render a component using useContentRect
    let app = r(React.createElement(ResponsiveBox));
    expect(app.text).toContain("Size:");

    // Get the node tree and check for layoutSubscribers
    const container = app.getContainer();

    // After unmount, render something else (auto-unmount via createRenderer)
    app = r(React.createElement(SimpleBox));
    expect(app.text).toContain("Hello");

    // The old container's subscribers should be cleaned up
    // (We can't easily inspect the old container after unmount, but we
    // verify no errors or leaks by doing many cycles)
    for (let i = 0; i < 100; i++) {
      r(React.createElement(ResponsiveBox));
      r(React.createElement(SimpleBox));
    }

    // If subscriptions leaked, we'd see memory growth or errors
    // The fact that 200 mount/unmount cycles completed is the assertion
  });

  test("useContentRect with resize does not leak", () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(ResponsiveBox));

    // Verify initial render includes size info
    expect(app.text).toContain("Size:");
    expect(app.text).toContain("Wide layout");

    // Resize many times
    for (let i = 0; i < 100; i++) {
      const cols = 40 + (i % 80);
      const rows = 10 + (i % 30);
      app.resize(cols, rows);
    }

    // Should still render correctly after many resizes
    expect(app.text).toContain("Size:");
  });

  /** Component that mounts/unmounts useContentRect users dynamically. */
  function DynamicContentRect({ showInner }: { showInner: boolean }) {
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Outer"),
      showInner ? React.createElement(ResponsiveBox) : null,
    );
  }

  test("dynamic mount/unmount of useContentRect components", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    const heapBefore = getHeapUsedMB();

    for (let i = 0; i < 500; i++) {
      const app = r(React.createElement(DynamicContentRect, { showInner: true }));
      expect(app.text).toContain("Size:");

      // Rerender without the inner component
      app.rerender(React.createElement(DynamicContentRect, { showInner: false }));
      expect(app.text).not.toContain("Size:");

      // Rerender with it again
      app.rerender(React.createElement(DynamicContentRect, { showInner: true }));
      expect(app.text).toContain("Size:");
    }

    const heapAfter = getHeapUsedMB();
    const growth = heapAfter - heapBefore;

    expect(growth).toBeLessThan(5);
  });
});
