import { describe, expect, test } from "vitest"
import { createHeightModel } from "../../packages/ag-react/src/ui/components/list-view/height-model"
import {
  captureAnchorAtViewportY,
  clampAnchorPoint,
  computeViewportTopFromAnchor,
  createContentGeometry,
  reseedAnchorFromFallbackTop,
  resolvePinOffset,
  resolveScrollPositionTop,
  type AnchorPoint,
  type Pin,
  type ScrollPosition,
} from "../../packages/ag-react/src/ui/components/list-view/scroll-position"

const keys = ["a", "b", "c", "d"]

function model() {
  const m = createHeightModel({ itemCount: keys.length, estimate: () => 1, gap: 0 })
  m.setMeasured(0, 3)
  m.setMeasured(1, 5)
  m.setMeasured(2, 2)
  m.setMeasured(3, 4)
  return m
}

function keyAtIndex(index: number): string | null {
  return keys[index] ?? null
}

function geometry() {
  return createContentGeometry({ model: model(), keyAtIndex })
}

describe("ListView ScrollPosition model", () => {
  test("resolves viewport pins in row-space units", () => {
    expect(resolvePinOffset({ kind: "top" }, 20)).toBe(0)
    expect(resolvePinOffset({ kind: "center" }, 20)).toBe(10)
    expect(resolvePinOffset({ kind: "bottom" }, 20)).toBe(20)
    expect(resolvePinOffset({ kind: "offset", value: 6, unit: "axis" }, 20)).toBe(6)
    expect(resolvePinOffset({ kind: "offset", value: 0.25, unit: "fraction" }, 20)).toBe(5)
  })

  test("computes viewport top from anchor point and pin", () => {
    const point: AnchorPoint<string> = { key: "c", offset: 1 }
    const pin: Pin = { kind: "center" }

    expect(
      computeViewportTopFromAnchor({
        point,
        pin,
        geometry: geometry(),
        viewport: { height: 6 },
      }),
    ).toBe(6)
  })

  test("captures an anchor at a viewport-local y coordinate", () => {
    expect(
      captureAnchorAtViewportY({
        geometry: geometry(),
        viewportTopRow: 4,
        viewportY: 2,
      }),
    ).toEqual({ key: "b", offset: 3 })
  })

  test("clamps anchor offset when the anchored item shrinks", () => {
    expect(clampAnchorPoint({ key: "b", offset: 99 }, 5)).toEqual({ key: "b", offset: 4 })
    expect(clampAnchorPoint({ key: "b", offset: -4 }, 5)).toEqual({ key: "b", offset: 0 })
    expect(clampAnchorPoint({ key: "b", offset: 0 }, 0)).toEqual({ key: "b", offset: 0 })
  })

  test("falls back to last known top row when the anchor key disappears", () => {
    const position: ScrollPosition<string> = {
      kind: "anchored",
      point: { key: "missing", offset: 0 },
      pin: { kind: "top" },
    }

    expect(
      resolveScrollPositionTop(position, geometry(), { height: 6, fallbackTopRow: 8 }),
    ).toEqual({
      topRow: 8,
      position: { kind: "anchored", point: { key: "c", offset: 0 }, pin: { kind: "top" } },
      fallbackUsed: true,
    })
  })

  test("end is a sentinel for content bottom, not last item plus offset", () => {
    expect(resolveScrollPositionTop({ kind: "end" }, geometry(), { height: 6 })).toEqual({
      topRow: 8,
      position: { kind: "end" },
      fallbackUsed: false,
    })
  })

  test("can reseed a missing anchor from a fallback row", () => {
    expect(
      reseedAnchorFromFallbackTop({
        geometry: geometry(),
        fallbackTopRow: 8,
      }),
    ).toEqual({ key: "c", offset: 0 })
  })
})
