/**
 * VirtualList Component
 *
 * React-level virtualization for long lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual height.
 *
 * Uses inkx overflow="scroll" internally for native scrolling support.
 *
 * @example
 * ```tsx
 * // Declarative (parent controls scroll position)
 * <VirtualList
 *   items={cards}
 *   height={20}
 *   itemHeight={1}
 *   scrollTo={selectedIndex}
 *   renderItem={(card, index) => (
 *     <TreeCard key={card.id} card={card} isSelected={index === selected} />
 *   )}
 * />
 *
 * // Interactive (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
 * <VirtualList
 *   items={items}
 *   height={20}
 *   itemHeight={1}
 *   interactive
 *   onSelect={(index) => openItem(items[index])}
 *   renderItem={(item, index, meta) => (
 *     <Text>{meta?.isSelected ? '> ' : '  '}{item.name}</Text>
 *   )}
 * />
 * ```
 */
import { createLogger } from "@beorn/logger"
import React, { forwardRef, useCallback, useImperativeHandle, useState } from "react"
import { useInput } from "../hooks/useInput.js"
import { useVirtualization } from "../hooks/useVirtualization.js"
import { Box } from "./Box.js"

const log = createLogger("inkx:virtuallist")

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ItemMeta {
  /** Whether this item is the currently selected item (interactive mode only) */
  isSelected: boolean
}

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the list viewport in rows */
  height: number

  /** Height of each item in rows (fixed or function for variable heights) */
  itemHeight?: number | ((item: T, index: number) => number)

  /** Index to keep visible (scrolls if off-screen). Ignored when interactive=true. */
  scrollTo?: number

  /** Extra items to render above/below viewport for smooth scrolling (default: 5) */
  overscan?: number

  /** Maximum items to render at once (default: 100) */
  maxRendered?: number

  /** Render function for each item. Third arg provides selection metadata. */
  renderItem: (item: T, index: number, meta?: ItemMeta) => React.ReactNode

  /** Show overflow indicators (▲N/▼N) */
  overflowIndicator?: boolean

  /** Optional key extractor (defaults to index) */
  keyExtractor?: (item: T, index: number) => string | number

  /** Width of the list (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows (default: 0) */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Predicate to determine if an item should be frozen (skipped from rendering).
   * Only a contiguous prefix of frozen items is removed from the list.
   * Frozen items are excluded from rendering -- callers can use Static or
   * useScrollback to push them to terminal scrollback separately. */
  frozen?: (item: T, index: number) => boolean

  // ── Interactive mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  interactive?: boolean

  /** Currently selected index (controlled). Managed internally when not provided. */
  selectedIndex?: number

  /** Called when selection changes (keyboard or mouse wheel navigation) */
  onSelectionChange?: (index: number) => void

  /** Called when Enter is pressed on the selected item */
  onSelect?: (index: number) => void
}

export interface VirtualListHandle {
  /** Scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ITEM_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100
/** Items to move per mouse wheel tick */
const WHEEL_STEP = 3

/**
 * Padding from edge before scrolling (in items).
 *
 * Vertical lists use padding=2 for more context visibility (you typically
 * want to see what's coming when scrolling through a long list).
 *
 * @see calcEdgeBasedScrollOffset in scroll-utils.ts for the algorithm
 */
const SCROLL_PADDING = 2

// =============================================================================
// Component
// =============================================================================

/**
 * VirtualList - React-level virtualized list with native inkx scrolling.
 *
 * Only renders items within the visible viewport plus overscan.
 * Uses placeholder boxes for virtual height to maintain scrollbar position.
 *
 * Scroll state management:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: completely freeze scroll state (do nothing)
 *
 * This freeze behavior is critical for multi-column layouts where only one
 * column is "selected" at a time. Non-selected columns must not recalculate
 * their scroll position.
 */
function VirtualListInner<T>(
  {
    items,
    height,
    itemHeight = DEFAULT_ITEM_HEIGHT,
    scrollTo: scrollToProp,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    renderItem,
    overflowIndicator,
    keyExtractor,
    width,
    gap = 0,
    renderSeparator,
    frozen,
    interactive,
    selectedIndex: selectedIndexProp,
    onSelectionChange,
    onSelect,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>,
): React.ReactElement {
  // ── Interactive mode: internal selection state ────────────────────
  // Semi-controlled: internal state is the source of truth.
  // Prop syncs initial value and external updates.
  const [internalIndex, setInternalIndex] = useState(selectedIndexProp ?? 0)
  const lastPropRef = React.useRef(selectedIndexProp)
  if (selectedIndexProp !== undefined && selectedIndexProp !== lastPropRef.current) {
    lastPropRef.current = selectedIndexProp
    setInternalIndex(selectedIndexProp)
  }
  const activeSelection = interactive ? internalIndex : -1

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      setInternalIndex(clamped)
      onSelectionChange?.(clamped)
    },
    [items.length, onSelectionChange],
  )

  // Keyboard input for interactive mode
  useInput(
    (input, key) => {
      if (!interactive) return
      const cur = activeSelection
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return) onSelect?.(cur)
    },
    { isActive: interactive },
  )

  // In interactive mode, scrollTo is derived from selection
  const scrollTo = interactive ? activeSelection : scrollToProp
  // Compute contiguous frozen prefix count
  let frozenCount = 0
  if (frozen) {
    for (let i = 0; i < items.length; i++) {
      if (!frozen(items[i]!, i)) break
      frozenCount++
    }
  }

  // Slice items to exclude frozen prefix
  const activeItems = frozenCount > 0 ? items.slice(frozenCount) : items

  // Adjust scrollTo to account for frozen items
  const adjustedScrollTo = scrollTo !== undefined ? Math.max(0, scrollTo - frozenCount) : undefined

  // Adjust itemHeight function to use original indices
  const adjustedItemHeight =
    typeof itemHeight === "function" && frozenCount > 0
      ? (item: T, index: number) => itemHeight(item, index + frozenCount)
      : itemHeight

  // Use shared virtualization hook with adjusted items and indices
  const {
    startIndex,
    endIndex,
    currentSelectedIndex,
    leadingPlaceholderSize,
    trailingPlaceholderSize,
    scrollToItem: rawScrollToItem,
  } = useVirtualization({
    items: activeItems,
    viewportSize: height,
    itemSize: adjustedItemHeight,
    scrollTo: adjustedScrollTo,
    scrollPadding: SCROLL_PADDING,
    overscan,
    maxRendered,
    gap,
  })

  // Wrap scrollToItem to accept original indices
  const scrollToItem = React.useCallback(
    (index: number) => rawScrollToItem(Math.max(0, index - frozenCount)),
    [rawScrollToItem, frozenCount],
  )

  // Expose scrollToItem method via ref for imperative scrolling
  useImperativeHandle(ref, () => ({ scrollToItem }), [scrollToItem])

  // Empty state
  if (activeItems.length === 0) {
    return (
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // Get the slice of items to render (from active items, frozen prefix already excluded)
  const visibleItems = activeItems.slice(startIndex, endIndex)

  // Calculate scrollTo index for inkx Box
  // inkx scrollTo expects the INDEX of the child to scroll into view
  // Account for top placeholder being child 0 when present
  const hasTopPlaceholder = leadingPlaceholderSize > 0
  const selectedIndexInSlice = currentSelectedIndex - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice

  // Pass scrollTo to inkx Box:
  // Always pass the selected child index when it's in the rendered slice.
  // This works for both declarative mode (scrollTo prop) and imperative mode
  // (scrollToItem via ref). For frozen columns, scrollState is preserved so
  // the index points to the same child as before (no visual change).
  const boxScrollTo = isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined

  log.debug?.(
    `VirtualList render: scrollTo=${scrollTo} boxScrollTo=${boxScrollTo} frozen=${scrollTo === undefined} start=${startIndex} end=${endIndex} currentSelected=${currentSelectedIndex} isInSlice=${isSelectedInSlice}`,
  )

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      overflow="scroll"
      scrollTo={boxScrollTo}
      overflowIndicator={overflowIndicator}
      onWheel={
        interactive
          ? (e) => {
              const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
              moveTo(activeSelection + delta)
            }
          : undefined
      }
    >
      {/* Top placeholder for virtual height */}
      {leadingPlaceholderSize > 0 && <Box height={leadingPlaceholderSize} flexShrink={0} />}

      {/* Render visible items */}
      {visibleItems.map((item, i) => {
        const activeIndex = startIndex + i
        const originalIndex = activeIndex + frozenCount
        const key = keyExtractor ? keyExtractor(item, originalIndex) : originalIndex
        const isLast = i === visibleItems.length - 1
        const meta: ItemMeta = { isSelected: originalIndex === activeSelection }

        return (
          <React.Fragment key={key}>
            {renderItem(item, originalIndex, meta)}
            {!isLast && renderSeparator && renderSeparator()}
            {!isLast && gap > 0 && !renderSeparator && <Box height={gap} flexShrink={0} />}
          </React.Fragment>
        )
      })}

      {/* Bottom placeholder for virtual height */}
      {trailingPlaceholderSize > 0 && <Box height={trailingPlaceholderSize} flexShrink={0} />}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> },
) => React.ReactElement
