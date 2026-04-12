/**
 * Layout dirty regression tests — Phase 1 verification.
 *
 * These tests document why it's safe to remove silvery's `layoutDirty` field
 * (the parallel dirty tracking system that ran alongside Flexily's own
 * `isDirty()` propagation). They verify the two invariants that make the
 * removal safe:
 *
 *   1. Every code path that used to set `instance.layoutDirty = true` also
 *      calls `markSubtreeDirty(instance)`, which propagates SUBTREE_BIT up
 *      to the root.
 *
 *   2. Every code path that used to call `layoutNode.markDirty()` (which
 *      walks up Flexily's tree setting `_isDirty`) still does.
 *
 * Together, these mean `propagateLayout`'s incremental skip guard
 * (SUBTREE_BIT || CHILDREN_BIT) catches every case the old
 * `!node.layoutDirty` check caught, and `layoutPhase`'s top-level gate
 * (`root.layoutNode.isDirty()`) sees every layout change.
 *
 * Historical bug fixes verified here:
 * - `ea8638fe` (scroll container dynamic mount) — appendChild propagates
 *   SUBTREE_BIT so propagateLayout doesn't skip over new children
 * - `3c27b790` (fold/collapse STRICT regression) — CHILDREN_BIT + SUBTREE_BIT
 *   propagate when children restructure
 */

import { test, expect, describe, beforeAll } from "vitest"
import { hostConfig } from "@silvery/ag-react/reconciler/host-config"
import { createNode } from "@silvery/ag-react/reconciler/nodes"
import {
  isDirty,
  SUBTREE_BIT,
  CHILDREN_BIT,
  advanceRenderEpoch,
} from "@silvery/ag/epoch"
import { ensureDefaultLayoutEngine } from "@silvery/ag-term/layout-engine"

beforeAll(async () => {
  await ensureDefaultLayoutEngine("flexily")
})

describe("layoutDirty removal — dirty-flag propagation regression", () => {
  test("appendChild propagates SUBTREE_BIT to ancestor (ea8638fe)", () => {
    advanceRenderEpoch()
    const root = createNode("silvery-box", {})
    const mid = createNode("silvery-box", {})
    const leaf = createNode("silvery-box", {})
    hostConfig.appendInitialChild(root, mid)

    // Clean state
    advanceRenderEpoch()
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(false)

    // Dynamic mount: runtime appendChild
    hostConfig.appendChild(mid, leaf)

    // SUBTREE_BIT must reach root so propagateLayout won't skip it.
    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, CHILDREN_BIT)).toBe(true)
    // Flexily isDirty also propagates to root.
    expect(root.layoutNode!.isDirty()).toBe(true)
  })

  test("removeChild propagates SUBTREE_BIT to ancestor (3c27b790 fold/collapse)", () => {
    advanceRenderEpoch()
    const root = createNode("silvery-box", {})
    const mid = createNode("silvery-box", {})
    const leaf = createNode("silvery-box", {})
    hostConfig.appendInitialChild(root, mid)
    hostConfig.appendInitialChild(mid, leaf)

    advanceRenderEpoch()
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(false)

    hostConfig.removeChild(mid, leaf)

    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, CHILDREN_BIT)).toBe(true)
    expect(root.layoutNode!.isDirty()).toBe(true)
  })

  test("commitUpdate with layoutChanged propagates SUBTREE_BIT", () => {
    advanceRenderEpoch()
    const root = createNode("silvery-box", {})
    const mid = createNode("silvery-box", { margin: 0 } as any)
    hostConfig.appendInitialChild(root, mid)

    advanceRenderEpoch()
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(false)

    const oldProps = { margin: 0 } as any
    const newProps = { margin: 2 } as any
    // commitUpdate(instance, type, oldProps, newProps, finishedWork)
    hostConfig.commitUpdate(mid, "silvery-box", oldProps, newProps, null)

    // markSubtreeDirty(mid) fires when layoutChanged → SUBTREE_BIT walks to root
    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    // Flexily markDirty() propagates to root.
    expect(root.layoutNode!.isDirty()).toBe(true)
  })

  test("clearContainer sets CHILDREN_BIT + SUBTREE_BIT + Flexily dirty", () => {
    advanceRenderEpoch()
    const root = createNode("silvery-box", {})
    const child = createNode("silvery-box", {})
    hostConfig.appendInitialChild(root, child)

    advanceRenderEpoch()
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, CHILDREN_BIT)).toBe(false)

    hostConfig.clearContainer({ root, onRender: () => {} })

    expect(isDirty(root.dirtyBits, root.dirtyEpoch, CHILDREN_BIT)).toBe(true)
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(root.layoutNode!.isDirty()).toBe(true)
  })

  test("hideInstance propagates SUBTREE_BIT and Flexily dirty", () => {
    advanceRenderEpoch()
    const root = createNode("silvery-box", {})
    const mid = createNode("silvery-box", {})
    const leaf = createNode("silvery-box", {})
    hostConfig.appendInitialChild(root, mid)
    hostConfig.appendInitialChild(mid, leaf)

    advanceRenderEpoch()
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(false)

    hostConfig.hideInstance(leaf)

    expect(leaf.hidden).toBe(true)
    expect(isDirty(leaf.dirtyBits, leaf.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(mid.dirtyBits, mid.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)).toBe(true)
    expect(root.layoutNode!.isDirty()).toBe(true)
  })
})
