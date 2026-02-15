/**
 * Tests for PositionRegistry and GridCell.
 */

import { describe, expect, it } from "vitest"
import { createPositionRegistry } from "../src/hooks/usePositionRegistry.js"

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

  it("clear removes all positions", () => {
    const reg = createPositionRegistry()
    reg.register(0, 0, { x: 0, y: 0, width: 30, height: 5 })
    reg.register(1, 0, { x: 30, y: 0, width: 30, height: 5 })

    reg.clear()

    expect(reg.hasSection(0)).toBe(false)
    expect(reg.hasSection(1)).toBe(false)
  })
})
