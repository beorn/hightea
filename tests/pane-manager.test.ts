/**
 * Tests for pane-manager — pure layout tree manipulation functions.
 */

import { describe, expect, test } from "vitest"
import {
  createLeaf,
  findAdjacentPane,
  getPaneIds,
  getTabOrder,
  removePane,
  resizeSplit,
  splitPane,
  swapPanes,
  type LayoutNode,
} from "../src/pane-manager.js"

// ============================================================================
// createLeaf
// ============================================================================

describe("createLeaf", () => {
  test("returns a leaf node with the given id", () => {
    const leaf = createLeaf("main")
    expect(leaf).toEqual({ type: "leaf", id: "main" })
  })
})

// ============================================================================
// getPaneIds
// ============================================================================

describe("getPaneIds", () => {
  test("single leaf returns one id", () => {
    expect(getPaneIds(createLeaf("a"))).toEqual(["a"])
  })

  test("split returns both children", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    expect(getPaneIds(layout)).toEqual(["a", "b"])
  })

  test("nested splits return all leaves in DFS order", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")

    // Tree: split(h, split(v, a, c), b)
    expect(getPaneIds(layout)).toEqual(["a", "c", "b"])
  })
})

// ============================================================================
// splitPane
// ============================================================================

describe("splitPane", () => {
  test("splits a single leaf horizontally", () => {
    const layout = splitPane(createLeaf("main"), "main", "horizontal", "new")
    expect(layout).toEqual({
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      first: { type: "leaf", id: "main" },
      second: { type: "leaf", id: "new" },
    })
  })

  test("splits a single leaf vertically with custom ratio", () => {
    const layout = splitPane(createLeaf("main"), "main", "vertical", "new", 0.3)
    expect(layout).toEqual({
      type: "split",
      direction: "vertical",
      ratio: 0.3,
      first: { type: "leaf", id: "main" },
      second: { type: "leaf", id: "new" },
    })
  })

  test("splits a specific pane in a tree", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    // Now split "b"
    layout = splitPane(layout, "b", "vertical", "c")

    expect(getPaneIds(layout)).toEqual(["a", "b", "c"])
    // b should now be in a vertical split with c
    expect(layout.type).toBe("split")
    if (layout.type === "split") {
      expect(layout.second).toEqual({
        type: "split",
        direction: "vertical",
        ratio: 0.5,
        first: { type: "leaf", id: "b" },
        second: { type: "leaf", id: "c" },
      })
    }
  })

  test("clamps ratio to [0.1, 0.9]", () => {
    const low = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.01)
    expect(low.type === "split" && low.ratio).toBe(0.1)

    const high = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.99)
    expect(high.type === "split" && high.ratio).toBe(0.9)
  })

  test("returns unchanged layout when target pane not found", () => {
    const layout = createLeaf("a")
    const result = splitPane(layout, "nonexistent", "horizontal", "b")
    expect(result).toBe(layout) // Same reference
  })
})

// ============================================================================
// removePane
// ============================================================================

describe("removePane", () => {
  test("returns null when removing the only pane", () => {
    expect(removePane(createLeaf("a"), "a")).toBeNull()
  })

  test("returns unchanged leaf when target not found", () => {
    const leaf = createLeaf("a")
    expect(removePane(leaf, "b")).toBe(leaf)
  })

  test("returns sibling when removing first child", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const result = removePane(layout, "a")
    expect(result).toEqual({ type: "leaf", id: "b" })
  })

  test("returns sibling when removing second child", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const result = removePane(layout, "b")
    expect(result).toEqual({ type: "leaf", id: "a" })
  })

  test("promotes subtree when removing from nested layout", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "b", "vertical", "c")

    // Remove "b" — its sibling "c" should take its place
    const result = removePane(layout, "b")!
    expect(getPaneIds(result)).toEqual(["a", "c"])
  })

  test("deeply nested removal", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")
    layout = splitPane(layout, "c", "horizontal", "d")

    // Remove "d"
    const result = removePane(layout, "d")!
    expect(getPaneIds(result)).toEqual(["a", "c", "b"])
  })
})

// ============================================================================
// swapPanes
// ============================================================================

describe("swapPanes", () => {
  test("swaps two leaves in a simple split", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const result = swapPanes(layout, "a", "b")
    expect(getPaneIds(result)).toEqual(["b", "a"])
  })

  test("swaps panes in nested layout", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "b", "vertical", "c")

    const result = swapPanes(layout, "a", "c")
    expect(getPaneIds(result)).toEqual(["c", "b", "a"])
  })

  test("returns unchanged layout when pane ids not found", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const result = swapPanes(layout, "x", "y")
    expect(result).toBe(layout)
  })
})

// ============================================================================
// resizeSplit
// ============================================================================

describe("resizeSplit", () => {
  test("increases ratio when pane is in first child", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.5)
    const result = resizeSplit(layout, "a", 0.1)
    expect(result.type === "split" && result.ratio).toBeCloseTo(0.6)
  })

  test("increases ratio (shrinks first) when pane is in second child", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.5)
    const result = resizeSplit(layout, "b", 0.1)
    // Growing "b" (second child) means shrinking first -> ratio decreases
    expect(result.type === "split" && result.ratio).toBeCloseTo(0.4)
  })

  test("clamps ratio to [0.1, 0.9]", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.5)

    const grown = resizeSplit(layout, "a", 0.8)
    expect(grown.type === "split" && grown.ratio).toBe(0.9)

    const shrunk = resizeSplit(layout, "a", -0.8)
    expect(shrunk.type === "split" && shrunk.ratio).toBe(0.1)
  })

  test("returns unchanged layout for leaf", () => {
    const leaf = createLeaf("a")
    expect(resizeSplit(leaf, "a", 0.1)).toBe(leaf)
  })

  test("returns unchanged when delta is zero", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b", 0.5)
    expect(resizeSplit(layout, "a", 0)).toBe(layout)
  })
})

// ============================================================================
// findAdjacentPane
// ============================================================================

describe("findAdjacentPane", () => {
  test("finds right neighbor in horizontal split", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    expect(findAdjacentPane(layout, "a", "right")).toBe("b")
  })

  test("finds left neighbor in horizontal split", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    expect(findAdjacentPane(layout, "b", "left")).toBe("a")
  })

  test("finds down neighbor in vertical split", () => {
    const layout = splitPane(createLeaf("a"), "a", "vertical", "b")
    expect(findAdjacentPane(layout, "a", "down")).toBe("b")
  })

  test("finds up neighbor in vertical split", () => {
    const layout = splitPane(createLeaf("a"), "a", "vertical", "b")
    expect(findAdjacentPane(layout, "b", "up")).toBe("a")
  })

  test("returns null when no neighbor in direction", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    // No vertical split, so up/down should be null
    expect(findAdjacentPane(layout, "a", "up")).toBeNull()
    expect(findAdjacentPane(layout, "a", "down")).toBeNull()
  })

  test("returns null at boundary", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    expect(findAdjacentPane(layout, "a", "left")).toBeNull()
    expect(findAdjacentPane(layout, "b", "right")).toBeNull()
  })

  test("navigates across nested splits", () => {
    // Layout: hsplit(vsplit(a, c), b)
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")

    // "c" is bottom-left, should find "b" to the right
    expect(findAdjacentPane(layout, "c", "right")).toBe("b")
    // "a" is top-left, should find "b" to the right
    expect(findAdjacentPane(layout, "a", "right")).toBe("b")
    // "b" going left enters the left subtree from the right edge,
    // so it finds the last leaf (closest to right boundary) = "c"
    expect(findAdjacentPane(layout, "b", "left")).toBe("c")
  })

  test("returns null for single pane", () => {
    const layout = createLeaf("only")
    expect(findAdjacentPane(layout, "only", "right")).toBeNull()
    expect(findAdjacentPane(layout, "only", "left")).toBeNull()
    expect(findAdjacentPane(layout, "only", "up")).toBeNull()
    expect(findAdjacentPane(layout, "only", "down")).toBeNull()
  })

  test("returns null for nonexistent pane", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    expect(findAdjacentPane(layout, "x", "right")).toBeNull()
  })
})

// ============================================================================
// getTabOrder
// ============================================================================

describe("getTabOrder", () => {
  test("single pane", () => {
    expect(getTabOrder(createLeaf("a"))).toEqual(["a"])
  })

  test("DFS left-to-right order", () => {
    // hsplit(vsplit(a, c), b)
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")

    expect(getTabOrder(layout)).toEqual(["a", "c", "b"])
  })

  test("deeply nested", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")
    layout = splitPane(layout, "b", "vertical", "d")

    expect(getTabOrder(layout)).toEqual(["a", "c", "b", "d"])
  })
})
