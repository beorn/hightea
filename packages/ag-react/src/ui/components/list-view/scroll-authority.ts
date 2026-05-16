export type ListViewScrollAuthority =
  | "declarative-row"
  | "follow-end"
  | "wheel-row"
  | "follow-disengage"
  | "visible-anchor"
  | "layout"

export interface ListViewRenderScrollRowInput {
  declarativeScrollRow: number | null
  followPinnedTopRow: number | null
  scrollRow: number | null
  followDisengageTopRow: number | null
  maintainedTopRow: number | null
}

export interface ListViewRenderScrollRowResult {
  row: number | null
  authority: ListViewScrollAuthority
}

export function resolveListViewRenderScrollRow({
  declarativeScrollRow,
  followPinnedTopRow,
  scrollRow,
  followDisengageTopRow,
  maintainedTopRow,
}: ListViewRenderScrollRowInput): ListViewRenderScrollRowResult {
  if (declarativeScrollRow !== null)
    return { row: declarativeScrollRow, authority: "declarative-row" }
  if (followPinnedTopRow !== null) return { row: followPinnedTopRow, authority: "follow-end" }
  if (scrollRow !== null) return { row: scrollRow, authority: "wheel-row" }
  if (followDisengageTopRow !== null)
    return { row: followDisengageTopRow, authority: "follow-disengage" }
  if (maintainedTopRow !== null) return { row: maintainedTopRow, authority: "visible-anchor" }
  return { row: null, authority: "layout" }
}

export function resolveListViewBoxScrollTo({
  renderScrollRow,
  selectedBoxScrollTo,
}: {
  renderScrollRow: number | null
  selectedBoxScrollTo: number | undefined
}): number | undefined {
  return renderScrollRow !== null ? undefined : selectedBoxScrollTo
}
