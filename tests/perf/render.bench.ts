/**
 * Silvery Render Benchmarks
 *
 * Measures full render pipeline performance: React reconciliation + layout +
 * content phase + output phase. Tests both initial renders and re-renders
 * (dirty-tracking updates).
 *
 * Run: bun vitest bench vendor/silvery/tests/perf/render.bench.ts
 */

import React from "react";
import { bench, describe, beforeAll } from "vitest";
import { createRenderer, type App } from "@silvery/test";
import { ensureDefaultLayoutEngine } from "@silvery/term/layout-engine";
import {
  SimpleItem,
  FlatList,
  KanbanBoard,
  Dashboard,
  DeepTree,
  CounterApp,
  CursorList,
} from "./fixtures";

beforeAll(async () => {
  await ensureDefaultLayoutEngine();
});

// ============================================================================
// Initial Render (cold — includes React tree creation + full pipeline)
// ============================================================================

describe("Initial Render", () => {
  bench("1 Box+Text (80x24)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    render(React.createElement(SimpleItem, { label: "Hello" }));
  });

  bench("10 Box+Text (80x24)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    render(React.createElement(FlatList, { count: 10 }));
  });

  bench("100 Box+Text (80x24)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    render(React.createElement(FlatList, { count: 100 }));
  });

  bench("100 styled Box+Text (80x24)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    render(React.createElement(FlatList, { count: 100, styled: true }));
  });

  bench("1000 Box+Text (120x40)", () => {
    const render = createRenderer({ cols: 120, rows: 40 });
    render(React.createElement(FlatList, { count: 1000 }));
  });

  bench("Kanban 3x10 (120x40)", () => {
    const render = createRenderer({ cols: 120, rows: 40 });
    render(React.createElement(KanbanBoard, { columns: 3, cardsPerColumn: 10 }));
  });

  bench("Kanban 3x50 (120x40)", () => {
    const render = createRenderer({ cols: 120, rows: 40 });
    render(React.createElement(KanbanBoard, { columns: 3, cardsPerColumn: 50 }));
  });

  bench("Dashboard 5 widgets (120x40)", () => {
    const render = createRenderer({ cols: 120, rows: 40 });
    render(React.createElement(Dashboard, { widgetCount: 5 }));
  });

  bench("Deep tree (50 levels)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    render(React.createElement(DeepTree, { depth: 50 }));
  });
});

// ============================================================================
// Re-render (warm — dirty-tracking incremental update)
// ============================================================================

describe("Re-render (incremental)", () => {
  let app10: App;
  let app100: App;
  let app1000: App;

  beforeAll(() => {
    const render10 = createRenderer({ cols: 80, rows: 24 });
    app10 = render10(React.createElement(CursorList, { count: 10, cursor: 0 }));

    const render100 = createRenderer({ cols: 80, rows: 24 });
    app100 = render100(React.createElement(CursorList, { count: 100, cursor: 0 }));

    const render1000 = createRenderer({ cols: 120, rows: 40 });
    app1000 = render1000(React.createElement(CursorList, { count: 1000, cursor: 0 }));
  });

  bench("Cursor move in 10-item list", () => {
    app10.rerender(React.createElement(CursorList, { count: 10, cursor: 1 }));
    app10.rerender(React.createElement(CursorList, { count: 10, cursor: 0 }));
  });

  bench("Cursor move in 100-item list", () => {
    app100.rerender(React.createElement(CursorList, { count: 100, cursor: 1 }));
    app100.rerender(React.createElement(CursorList, { count: 100, cursor: 0 }));
  });

  bench("Cursor move in 1000-item list", () => {
    app1000.rerender(React.createElement(CursorList, { count: 1000, cursor: 1 }));
    app1000.rerender(React.createElement(CursorList, { count: 1000, cursor: 0 }));
  });

  bench("Counter update (minimal state change)", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    const app = render(React.createElement(CounterApp, { count: 0 }));
    app.rerender(React.createElement(CounterApp, { count: 1 }));
  });
});

// ============================================================================
// Full React rerender (rerender root element — no dirty tracking)
// ============================================================================

describe("Full rerender (no dirty tracking)", () => {
  bench("100 Box+Text full rerender", () => {
    const render = createRenderer({ cols: 80, rows: 24 });
    const app = render(React.createElement(FlatList, { count: 100 }));
    app.rerender(React.createElement(FlatList, { count: 100 }));
  });

  bench("Kanban 3x50 full rerender", () => {
    const render = createRenderer({ cols: 120, rows: 40 });
    const app = render(React.createElement(KanbanBoard, { columns: 3, cardsPerColumn: 50 }));
    app.rerender(React.createElement(KanbanBoard, { columns: 3, cardsPerColumn: 50 }));
  });
});
