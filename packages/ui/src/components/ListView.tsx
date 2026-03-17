/**
 * ListView v5 — Unified virtualized list with pluggable domain objects.
 *
 * Three concerns as props — cache, navigator, search — each accepting:
 * - `true` for defaults
 * - A config object for customization
 * - A domain object for full programmatic control
 *
 * @example
 * ```tsx
 * // Simplest
 * <ListView items={items} cache navigator search renderItem={...} />
 *
 * // Configured
 * <ListView items={msgs}
 *   getKey={(m) => m.id}
 *   cache={{ isCacheable: (m) => m.done, capacity: 10_000 }}
 *   navigator={{ onActivate: (key, i) => open(key) }}
 *   search={{ getText: (m) => m.content }}
 *   followOutput
 *   renderItem={(msg, i, meta) => <Row msg={msg} cursor={meta.isCursor} />}
 * />
 *
 * // Domain objects
 * const cache = createListCache(...)
 * const nav = createListNavigator(...)
 * cache.freeze("msg-42"); nav.moveTo("msg-42")
 * <ListView items={msgs} cache={cache} navigator={nav} renderItem={...} />
 * ```
 */

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@silvery/react/hooks/useVirtualizer"
import { useInput } from "@silvery/react/hooks/useInput"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"
import { isListCache, resolveListCache } from "@silvery/term/list-cache"
import type { ListCache, ListCacheConfig } from "@silvery/term/list-cache"
import { isListNavigator, resolveListNavigator } from "@silvery/term/list-navigator"
import type { ListNavigator, ListNavigatorConfig } from "@silvery/term/list-navigator"
import { isListSearch, resolveListSearch } from "@silvery/term/list-search"
import type { ListSearch, ListSearchConfig } from "@silvery/term/list-search"

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ListItemMeta {
  /** Whether this item is at the cursor position (navigator mode only) */
  isCursor: boolean
}

export interface ListViewProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the viewport in rows */
  height: number

  /** Render function for each item. Third arg provides cursor metadata. */
  renderItem: (item: T, index: number, meta: ListItemMeta) => React.ReactNode

  /** Key extractor. Required when cache/navigator/search are used. */
  getKey?: (item: T, index: number) => string | number

  /** Estimated height of each item in rows (fixed or per-index function). Default: 1 */
  estimateHeight?: number | ((index: number) => number)

  /** Index to scroll to (declarative). Ignored when navigator or followOutput active. */
  scrollTo?: number

  /** Extra items to render beyond viewport for smooth scrolling. Default: 5 */
  overscan?: number

  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number

  /** Padding from edge before scrolling (in items). Default: 2 */
  scrollPadding?: number

  /** Show overflow indicators. Default: false */
  overflowIndicator?: boolean

  /** Width of the viewport (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows. Default: 0 */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Mouse wheel handler for scrolling (passive mode only) */
  onWheel?: (event: { deltaY: number }) => void

  /** Called when the visible range reaches near the end of the list (infinite scroll) */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /** Content rendered after all items inside the scroll container */
  listFooter?: React.ReactNode

  // ── v5 pluggable domain objects ──────────────────────────────────

  /** Cache: manages frozen items (virtualized prefix).
   * `true` | `{ isCacheable, capacity }` | `createListCache(...)` */
  cache?: true | ListCacheConfig<T> | ListCache<T>

  /** Navigator: manages cursor/keyboard navigation.
   * `true` | `{ onActivate }` | `createListNavigator(...)` */
  navigator?: true | ListNavigatorConfig | ListNavigator

  /** Search: manages Ctrl+F search overlay.
   * `true` | `{ getText }` | `createListSearch(...)` */
  search?: true | ListSearchConfig<T> | ListSearch<T>

  /** Auto-scroll to end when items are added. Default: false */
  followOutput?: boolean

  /** Whether this ListView is active for keyboard input. Default: true.
   * Set to false when another pane has focus in multi-pane layouts. */
  active?: boolean

  // ── Legacy props (kept for VirtualView/VirtualList wrappers) ─────

  /** @deprecated Use `navigator` instead */
  navigable?: boolean
  /** @deprecated Use navigator with onCursorChange */
  cursorIndex?: number
  /** @deprecated Use navigator with onCursorChange */
  onCursorIndexChange?: (index: number) => void
  /** @deprecated Use navigator with onActivate */
  onSelect?: (index: number) => void
  /** @deprecated Use `cache` instead */
  virtualized?: (item: T, index: number) => boolean
}

export interface ListViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Kept for backward compat (exported but deprecated)
// =============================================================================

/** @deprecated Use ListCacheConfig instead */
export interface ListViewHistoryConfig<T> {
  mode: "none" | "virtual"
  freezeWhen?: (item: T, index: number) => boolean
  maxRows?: number
}

/** @deprecated Use ListSearchConfig with getText instead */
export interface ListTextAdapter<T> {
  getItemText: (item: T) => string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ESTIMATE_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100
const DEFAULT_SCROLL_PADDING = 2
const WHEEL_STEP = 3

// =============================================================================
// Internal: resolve and persist domain objects across renders
// =============================================================================

function useResolvedRef<T, Prop>(
  prop: Prop | undefined,
  isInstance: (v: unknown) => boolean,
  resolve: (p: Prop) => T,
): T | null {
  const ref = useRef<{ prop: Prop | undefined; instance: T | null }>({ prop: undefined, instance: null })
  if (prop) {
    if (isInstance(prop)) {
      // External domain object — use directly
      ref.current = { prop, instance: prop as T }
    } else if (!ref.current.instance || ref.current.prop !== prop) {
      // Boolean true or config — create internal instance (only once per prop identity)
      ref.current = { prop, instance: resolve(prop) }
    }
  } else if (ref.current.instance) {
    ref.current = { prop: undefined, instance: null }
  }
  return ref.current.instance
}

// =============================================================================
// Component
// =============================================================================

function ListViewInner<T>(
  {
    items,
    height,
    estimateHeight = DEFAULT_ESTIMATE_HEIGHT,
    renderItem,
    scrollTo: scrollToProp,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overflowIndicator,
    getKey,
    width,
    gap = 0,
    renderSeparator,
    onWheel: onWheelProp,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
    cache: cacheProp,
    navigator: navigatorProp,
    search: searchProp,
    followOutput,
    active,
    // Legacy props
    navigable,
    cursorIndex: cursorIndexProp,
    onCursorIndexChange,
    onSelect,
    virtualized,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Resolve domain objects ──────────────────────────────────────
  const cache = useResolvedRef(cacheProp, isListCache, (p) =>
    resolveListCache(p as true | ListCacheConfig<T> | ListCache<T>),
  )
  const nav = useResolvedRef(navigatorProp, isListNavigator, (p) =>
    resolveListNavigator(p as true | ListNavigatorConfig | ListNavigator),
  )
  const search = useResolvedRef(searchProp, isListSearch, (p) =>
    resolveListSearch(p as true | ListSearchConfig<T> | ListSearch<T>),
  )

  const effectiveGetKey = getKey ?? ((_: T, i: number) => i)

  // ── Legacy navigable mode (for VirtualList wrapper) ─────────────
  const isLegacyNavigable = navigable && !nav
  const isControlled = cursorIndexProp !== undefined
  const [uncontrolledCursor, setUncontrolledCursor] = useState(0)
  const activeLegacyCursor = isLegacyNavigable ? (isControlled ? cursorIndexProp! : uncontrolledCursor) : -1

  const legacyMoveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      if (!isControlled) setUncontrolledCursor(clamped)
      onCursorIndexChange?.(clamped)
    },
    [isControlled, items.length, onCursorIndexChange],
  )

  // ── Cache: compute frozen prefix ────────────────────────────────
  let frozenCount = 0
  if (cache) {
    frozenCount = cache.update(items, effectiveGetKey)
  }

  // Legacy virtualized prop
  let legacyVirtualizedCount = 0
  if (!cache && virtualized) {
    for (let i = 0; i < items.length; i++) {
      if (!virtualized(items[i]!, i)) break
      legacyVirtualizedCount++
    }
  }
  const totalVirtualized = frozenCount + legacyVirtualizedCount

  // ── Navigator: sync with live items ─────────────────────────────
  if (nav) {
    nav.sync(items, effectiveGetKey as (item: unknown, index: number) => string | number)
  }

  // ── Search: sync with live (non-frozen) items ───────────────────
  if (search) {
    const liveItems = totalVirtualized > 0 ? items.slice(totalVirtualized) : items
    search.sync(
      liveItems as readonly T[],
      ((item: T, i: number) => effectiveGetKey(item, i + totalVirtualized)) as (
        item: T,
        index: number,
      ) => string | number,
    )
  }

  // ── Active items (exclude frozen prefix) ────────────────────────
  const activeItems = totalVirtualized > 0 ? items.slice(totalVirtualized) : items

  // ── Cursor index ────────────────────────────────────────────────
  const cursorIndex = nav ? nav.cursorIndex : activeLegacyCursor

  // ── ScrollTo computation ────────────────────────────────────────
  let scrollTo: number | undefined
  if (followOutput) {
    scrollTo = activeItems.length - 1
  } else if (nav) {
    scrollTo = Math.max(0, cursorIndex - totalVirtualized)
  } else if (isLegacyNavigable) {
    scrollTo = Math.max(0, activeLegacyCursor - totalVirtualized)
  } else {
    scrollTo = scrollToProp !== undefined ? Math.max(0, scrollToProp - totalVirtualized) : undefined
  }

  // ── Adapt estimateHeight for virtualized offset ─────────────────
  const adjustedEstimateHeight = useMemo(() => {
    if (typeof estimateHeight === "number") return estimateHeight
    if (totalVirtualized > 0) {
      return (index: number) => estimateHeight(index + totalVirtualized)
    }
    return estimateHeight
  }, [estimateHeight, totalVirtualized])

  // ── useVirtualizer ──────────────────────────────────────────────
  const wrappedGetKey = useMemo(() => {
    if (!getKey) return undefined
    if (totalVirtualized === 0) return (index: number) => getKey(activeItems[index]!, index)
    return (index: number) => getKey(activeItems[index]!, index + totalVirtualized)
  }, [getKey, activeItems, totalVirtualized])

  const { range, leadingHeight, trailingHeight, scrollOffset, scrollToItem } = useVirtualizer({
    count: activeItems.length,
    estimateHeight: adjustedEstimateHeight,
    viewportHeight: height,
    scrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
    getItemKey: wrappedGetKey,
    onEndReached,
    onEndReachedThreshold,
  })

  // ── Keyboard input ──────────────────────────────────────────────
  const isActive = active !== false
  const hasNav = !!nav || isLegacyNavigable

  useInput(
    (input, key) => {
      // Search mode: intercept keys when search is active
      if (search?.isActive) {
        if (key.escape) {
          search.close()
          return
        }
        if (key.return && !key.shift) {
          search.next()
          // Navigate to match if navigator present
          if (search.currentMatch && nav) {
            nav.moveToIndex(search.currentMatch.itemIndex + totalVirtualized)
          }
          return
        }
        if (key.return && key.shift) {
          search.prev()
          if (search.currentMatch && nav) {
            nav.moveToIndex(search.currentMatch.itemIndex + totalVirtualized)
          }
          return
        }
        if (key.backspace) {
          search.backspace()
          return
        }
        if (input && !key.ctrl && !key.meta) {
          search.input(input)
          return
        }
        return // Consume all input when search active
      }

      // Ctrl+F: open search
      if (search && key.ctrl && input === "f") {
        search.open()
        return
      }

      // Navigator keyboard (v5 domain object)
      if (nav) {
        if (input === "j" || key.downArrow) nav.moveBy(1)
        else if (input === "k" || key.upArrow) nav.moveBy(-1)
        else if (input === "G" || key.end) nav.moveToLast()
        else if (key.home) nav.moveToFirst()
        else if (key.pageDown || (input === "d" && key.ctrl)) nav.pageDown(Math.floor(height / 2))
        else if (key.pageUp || (input === "u" && key.ctrl)) nav.pageUp(Math.floor(height / 2))
        else if (key.return) nav.activate()
        return
      }

      // Legacy navigable mode
      if (isLegacyNavigable) {
        const cur = activeLegacyCursor
        if (input === "j" || key.downArrow) legacyMoveTo(cur + 1)
        else if (input === "k" || key.upArrow) legacyMoveTo(cur - 1)
        else if (input === "G" || key.end) legacyMoveTo(items.length - 1)
        else if (key.home) legacyMoveTo(0)
        else if (key.pageDown || (input === "d" && key.ctrl)) legacyMoveTo(cur + Math.floor(height / 2))
        else if (key.pageUp || (input === "u" && key.ctrl)) legacyMoveTo(cur - Math.floor(height / 2))
        else if (key.return) onSelect?.(cur)
      }
    },
    { isActive: isActive && (hasNav || !!search) },
  )

  // ── Ref ─────────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - totalVirtualized))
      },
    }),
    [scrollToItem, totalVirtualized],
  )

  // ── Mouse wheel ─────────────────────────────────────────────────
  const onWheel = useMemo(() => {
    if (nav && isActive) {
      return (e: { deltaY: number }) => {
        const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
        nav.moveBy(delta)
      }
    }
    if (isLegacyNavigable && isActive) {
      return (e: { deltaY: number }) => {
        const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
        legacyMoveTo(activeLegacyCursor + delta)
      }
    }
    return onWheelProp
  }, [nav, isActive, isLegacyNavigable, activeLegacyCursor, legacyMoveTo, onWheelProp])

  // ── Empty state ─────────────────────────────────────────────────
  if (activeItems.length === 0) {
    return (
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  const { startIndex, endIndex } = range
  const visibleItems = activeItems.slice(startIndex, endIndex)

  const hasTopPlaceholder = leadingHeight > 0
  const currentScrollTarget =
    scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, activeItems.length - 1)) : scrollOffset
  const selectedIndexInSlice = currentScrollTarget - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice
  const boxScrollTo = isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined

  // Search bar (rendered at bottom when search is active)
  const searchBar = search?.isActive ? (
    <Box flexShrink={0}>
      <Text inverse>
        {" / "}
        {search.query}
        {search.matches.length > 0
          ? `  [${search.currentMatchIndex + 1}/${search.matches.length}]`
          : search.query
            ? "  [no matches]"
            : ""}
      </Text>
    </Box>
  ) : null

  return (
    <Box flexDirection="column" height={height} width={width}>
      <Box
        flexDirection="column"
        flexGrow={1}
        overflow="scroll"
        scrollTo={boxScrollTo}
        overflowIndicator={overflowIndicator}
        onWheel={onWheel}
      >
        {/* Leading placeholder for virtual height */}
        {leadingHeight > 0 && <Box height={leadingHeight} flexShrink={0} />}

        {/* Render visible items */}
        {visibleItems.map((item, i) => {
          const originalIndex = startIndex + i + totalVirtualized
          const key = getKey ? getKey(item, originalIndex) : startIndex + i
          const isLast = i === visibleItems.length - 1
          const meta: ListItemMeta = { isCursor: originalIndex === cursorIndex }

          return (
            <React.Fragment key={key}>
              {renderItem(item, originalIndex, meta)}
              {!isLast && renderSeparator && renderSeparator()}
              {!isLast && gap > 0 && !renderSeparator && <Box height={gap} flexShrink={0} />}
            </React.Fragment>
          )
        })}

        {/* Footer content */}
        {listFooter}

        {/* Trailing placeholder for virtual height */}
        {trailingHeight > 0 && <Box height={trailingHeight} flexShrink={0} />}
      </Box>

      {/* Search bar overlay */}
      {searchBar}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const ListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.ForwardedRef<ListViewHandle> },
) => React.ReactElement
