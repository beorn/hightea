import { describe, expect, test } from "vitest"
import {
  resolveListViewBoxScrollTo,
  resolveListViewRenderScrollRow,
} from "../../packages/ag-react/src/ui/components/list-view/scroll-authority"

describe("ListView scroll authority", () => {
  test("row-space wheel scroll renders from scrollRow before anchoring", () => {
    const resolved = resolveListViewRenderScrollRow({
      declarativeScrollRow: null,
      followPinnedTopRow: null,
      scrollRow: 120,
      followDisengageTopRow: null,
      maintainedTopRow: 126,
    })

    expect(resolved).toEqual({
      row: 120,
      authority: "wheel-row",
    })
  })

  test("declarative row-space scroll does not also delegate to Box scrollTo", () => {
    const resolved = resolveListViewRenderScrollRow({
      declarativeScrollRow: 42,
      followPinnedTopRow: null,
      scrollRow: null,
      followDisengageTopRow: null,
      maintainedTopRow: null,
    })

    expect(resolved).toEqual({
      row: 42,
      authority: "declarative-row",
    })
    expect(
      resolveListViewBoxScrollTo({
        renderScrollRow: resolved.row,
        selectedBoxScrollTo: 7,
      }),
    ).toBeUndefined()
  })

  test("falls back to Box scrollTo only when row-space has no owner", () => {
    expect(
      resolveListViewBoxScrollTo({
        renderScrollRow: null,
        selectedBoxScrollTo: 7,
      }),
    ).toBe(7)
  })
})
