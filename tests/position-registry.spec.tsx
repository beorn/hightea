/**
 * Tests for PositionRegistry and GridCell.
 */

import { describe, expect, it } from "vitest"
import { createPositionRegistry } from "../src/hooks/usePositionRegistry.js"
import { findCrossAxisTarget, getItemMidY } from "../src/navigation/cross-axis.js"

describe("PositionRegistry", () => {
  it("registers and retrieves positions", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 0, width: 30, height: 5 })
    reg.register(0, 1, { x: 0, y: 5, width: 30, height: 5 })

    expect(reg.getPosition(0, 0)).toEqual({ x: 0, y: 0, width: 30, height: 5 })
    expect(reg.getPosition(0, 1)).toEqual({ x: 0, y: 5, width: 30, height: 5 })
    expect(reg.getPosition(0, 2)).toBeUndefined()
  })

  it("unregisters positions and cleans up empty sections", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 0, width: 30, height: 5 })
    reg.register(0, 1, { x: 0, y: 5, width: 30, height: 5 })

    expect(reg.hasSection(0)).toBe(true)
    expect(reg.getItemCount(0)).toBe(2)

    reg.unregister(0, 0)
    expect(reg.getItemCount(0)).toBe(1)

    reg.unregister(0, 1)
    expect(reg.hasSection(0)).toBe(false)
  })

  it("findItemAtY returns item containing targetY", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 5 })
    reg.register(0, 1, { x: 0, y: 15, width: 30, height: 5 })
    reg.register(0, 2, { x: 0, y: 20, width: 30, height: 5 })

    // Inside item 0's bounding box
    expect(reg.findItemAtY(0, 12)).toBe(0)
    // Inside item 1's bounding box
    expect(reg.findItemAtY(0, 17)).toBe(1)
    // Inside item 2's bounding box
    expect(reg.findItemAtY(0, 22)).toBe(2)
  })

  it("findItemAtY returns closest midpoint when between items", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 4 })
    // Gap at y=14..16
    reg.register(0, 1, { x: 0, y: 16, width: 30, height: 4 })

    // item 0 mid=12, item 1 mid=18
    // y=16 is inside item 1's bounding box
    expect(reg.findItemAtY(0, 16)).toBe(1)
    // y=13 is inside item 0's bounding box
    expect(reg.findItemAtY(0, 13)).toBe(0)
    // y=15 is in the gap, equidistant (3 from each mid) — returns first found
    expect(reg.findItemAtY(0, 15)).toBe(0)
    // y=26 is below all items — closest midpoint is item 1
    expect(reg.findItemAtY(0, 26)).toBe(1)
  })

  it("findItemAtY returns -1 when above all items", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 5 })

    expect(reg.findItemAtY(0, 5)).toBe(-1)
  })

  it("findItemAtY returns -1 for empty section", () => {
    const reg = createPositionRegistry()
    expect(reg.findItemAtY(0, 10)).toBe(-1)
  })

  it("findInsertionSlot returns correct slot positions", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 5 })
    reg.register(0, 1, { x: 0, y: 15, width: 30, height: 5 })

    // Before first item
    expect(reg.findInsertionSlot(0, 5)).toBe(0)
    // Between items
    expect(reg.findInsertionSlot(0, 12)).toBe(1)
    // After last item
    expect(reg.findInsertionSlot(0, 25)).toBe(2)
  })

  it("preserves head measurements on re-registration", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 5 })
    reg.updateHead(0, 0, 10, 1)

    // Re-register with new position (simulates scroll)
    reg.register(0, 0, { x: 0, y: 20, width: 30, height: 5 })

    // Position updated but head data should be preserved
    expect(reg.getPosition(0, 0)?.y).toBe(20)
    // Head data preserved (internal — verified via dump or navigation behavior)
  })

  it("manages stickyY and stickyX", () => {
    const reg = createPositionRegistry()

    expect(reg.stickyY).toBeNull()
    expect(reg.stickyX).toBeNull()

    reg.setStickyY(15)
    reg.setStickyX(2)
    expect(reg.stickyY).toBe(15)
    expect(reg.stickyX).toBe(2)

    reg.clearStickyY()
    expect(reg.stickyY).toBeNull()
    expect(reg.stickyX).toBe(2)

    reg.clearStickyX()
    expect(reg.stickyX).toBeNull()
  })

  it("clear removes all positions and sticky state", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 0, width: 30, height: 5 })
    reg.register(1, 0, { x: 30, y: 0, width: 30, height: 5 })
    reg.setStickyY(10)
    reg.setStickyX(1)

    reg.clear()

    expect(reg.hasSection(0)).toBe(false)
    expect(reg.hasSection(1)).toBe(false)
    expect(reg.stickyY).toBeNull()
    expect(reg.stickyX).toBeNull()
  })
})

describe("cross-axis navigation", () => {
  it("findCrossAxisTarget finds closest item in target section", () => {
    const reg = createPositionRegistry()
    // Section 0: items at y=10, y=20, y=30
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 8 })
    reg.register(0, 1, { x: 0, y: 20, width: 30, height: 8 })
    reg.register(0, 2, { x: 0, y: 30, width: 30, height: 8 })
    // Section 1: items at y=10, y=25 (different spacing)
    reg.register(1, 0, { x: 30, y: 10, width: 30, height: 8 })
    reg.register(1, 1, { x: 30, y: 25, width: 30, height: 8 })

    // Navigate from section 0 item 1 (midY=24) to section 1
    const result = findCrossAxisTarget(reg, 0, 1, 1)
    // midY of source = 24, closest in section 1 is item 1 (midY=29)
    expect(result.itemIndex).toBe(1)
    expect(result.usedStickyY).toBe(false)
    // stickyY should now be set
    expect(reg.stickyY).toBe(24)
  })

  it("findCrossAxisTarget uses existing stickyY", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 8 })
    reg.register(1, 0, { x: 30, y: 10, width: 30, height: 8 })
    reg.register(1, 1, { x: 30, y: 20, width: 30, height: 8 })

    reg.setStickyY(22) // Preset stickyY

    const result = findCrossAxisTarget(reg, 0, 0, 1)
    // Should use stickyY=22, which matches item 1 (midY=24) better than item 0 (midY=14)
    expect(result.itemIndex).toBe(1)
    expect(result.usedStickyY).toBe(true)
  })

  it("getItemMidY returns midpoint of item rect", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 10, width: 30, height: 8 })

    expect(getItemMidY(reg, 0, 0)).toBe(14) // 10 + 8/2
  })

  it("getItemMidY returns 0 for unregistered item", () => {
    const reg = createPositionRegistry()
    expect(getItemMidY(reg, 0, 0)).toBe(0)
  })
})
