/**
 * Rect Signals — regression tests for G9 move to @silvery/ag.
 *
 * Verifies that rect-signals are importable from the framework-agnostic
 * core (@silvery/ag) with no ag-term dependency.
 */

import { describe, test, expect } from "vitest"
import { getRectSignals, hasRectSignals, syncRectSignals, type RectSignals } from "@silvery/ag/rect-signals"
import type { AgNode, Rect } from "@silvery/ag/types"

/** Minimal AgNode stub with rect fields for testing. */
function createStubNode(overrides?: Partial<AgNode>): AgNode {
  return {
    type: "silvery-box",
    id: "test-node",
    boxRect: { x: 0, y: 0, width: 10, height: 5 },
    scrollRect: { x: 0, y: 0, width: 10, height: 5 },
    screenRect: { x: 0, y: 0, width: 10, height: 5 },
    ...overrides,
  } as AgNode
}

describe("rect-signals (@silvery/ag)", () => {
  test("signals are created lazily on first getRectSignals call", () => {
    const node = createStubNode()

    // Before first access, no signals should exist
    expect(hasRectSignals(node)).toBe(false)

    // First access creates signals
    const signals = getRectSignals(node)
    expect(signals).toBeDefined()
    expect(hasRectSignals(node)).toBe(true)
  })

  test("getRectSignals returns same instance on repeated calls", () => {
    const node = createStubNode()
    const a = getRectSignals(node)
    const b = getRectSignals(node)
    expect(a).toBe(b)
  })

  test("signals initialize with node rect values", () => {
    const rect: Rect = { x: 5, y: 10, width: 20, height: 15 }
    const node = createStubNode({
      boxRect: rect,
      scrollRect: rect,
      screenRect: rect,
    })

    const signals = getRectSignals(node)
    expect(signals.boxRect()).toBe(rect)
    expect(signals.scrollRect()).toBe(rect)
    expect(signals.screenRect()).toBe(rect)
  })

  test("syncRectSignals updates signal values from node rects", () => {
    const initialRect: Rect = { x: 0, y: 0, width: 10, height: 5 }
    const updatedRect: Rect = { x: 1, y: 2, width: 20, height: 10 }
    const node = createStubNode({
      boxRect: initialRect,
      scrollRect: initialRect,
      screenRect: initialRect,
    })

    // Create signals (initializes from node)
    const signals = getRectSignals(node)
    expect(signals.boxRect()).toBe(initialRect)

    // Simulate layout phase updating node rects
    node.boxRect = updatedRect
    node.scrollRect = updatedRect
    node.screenRect = updatedRect

    // Sync propagates new values
    syncRectSignals(node)

    expect(signals.boxRect()).toBe(updatedRect)
    expect(signals.scrollRect()).toBe(updatedRect)
    expect(signals.screenRect()).toBe(updatedRect)
  })

  test("syncRectSignals is a no-op for nodes without signals", () => {
    const node = createStubNode()

    // Should not throw or create signals
    syncRectSignals(node)
    expect(hasRectSignals(node)).toBe(false)
  })

  test("different nodes get independent signal instances", () => {
    const node1 = createStubNode({ id: "node-1" })
    const node2 = createStubNode({ id: "node-2" })

    const signals1 = getRectSignals(node1)
    const signals2 = getRectSignals(node2)

    expect(signals1).not.toBe(signals2)

    // Updating one doesn't affect the other
    const newRect: Rect = { x: 99, y: 99, width: 1, height: 1 }
    node1.boxRect = newRect
    syncRectSignals(node1)

    expect(signals1.boxRect()).toBe(newRect)
    expect(signals2.boxRect()).not.toBe(newRect)
  })

  test("exports are available from @silvery/ag/rect-signals (no ag-term needed)", () => {
    // This test verifies the import path works — if it compiles and runs,
    // the move to @silvery/ag was successful.
    expect(typeof getRectSignals).toBe("function")
    expect(typeof hasRectSignals).toBe("function")
    expect(typeof syncRectSignals).toBe("function")
  })
})
