/**
 * ListView - Unified unmounted list component.
 *
 * Merges VirtualView's core (useVirtualizer, viewport rendering, placeholders)
 * with VirtualList's navigation (keyboard, mouse wheel, cursor state) into
 * a single component.
 *
 * @example
 * ```tsx
 * // Passive (parent controls scroll)
 * <ListView
 *   items={logs}
 *   height={20}
 *   renderItem={(item, index) => <LogEntry data={item} />}
 *   estimateHeight={() => 3}
 * />
 *
 * // Navigable (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
 * <ListView
 *   items={items}
 *   height={20}
 *   nav
 *   renderItem={(item, i, meta) => (
 *     <Text>{meta.isCursor ? '> ' : '  '}{item.name}</Text>
 *   )}
 *   onSelect={(index) => openItem(items[index])}
 * />
 * ```
 */

import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { sumHeights, useVirtualizer } from "../../hooks/useVirtualizer"
import { useInput } from "../../hooks/useInput"
import { Box, type BoxHandle } from "../../components/Box"
import type { AgNode } from "@silvery/ag/types"
import { CacheBackendContext, StdoutContext, TermContext } from "../../context"
import { renderStringSync } from "../../render-string"
import { createHistoryBuffer, createHistoryItem } from "@silvery/ag-term/history-buffer"
import type { HistoryBuffer } from "@silvery/ag-term/history-buffer"
import { createListDocument } from "@silvery/ag-term/list-document"
import type { LiveItemBlock } from "@silvery/ag-term/list-document"
import { createTextSurface } from "@silvery/ag-term/text-surface"
import type { TextSurface } from "@silvery/ag-term/text-surface"
import { composeViewport } from "@silvery/ag-term/viewport-compositor"
import type { ComposedViewport } from "@silvery/ag-term/viewport-compositor"
import { stripAnsi } from "@silvery/ag-term/unicode"
import { isLayoutEngineInitialized } from "@silvery/ag-term/layout-engine"
import { useSearchOptional } from "../../providers/SearchProvider"
import type { SearchMatch } from "@silvery/ag-term/search-overlay"

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ListItemMeta {
  /** Whether this item is at the cursor position (nav mode only) */
  isCursor: boolean
}

/** Cache configuration for ListView */
export interface ListViewCacheConfig<T> {
  /**
   * Cache backend mode:
   * - "none": No caching
   * - "virtual": In-memory HistoryBuffer ring buffer (fullscreen/panes)
   * - "terminal": Write to stdout as native scrollback via promoteScrollback (inline mode)
   * - "auto": Auto-select based on CacheBackendContext (set by runtime from rendering mode)
   */
  mode: "none" | "virtual" | "terminal" | "auto"
  /** Predicate for items that can be cached (removed from React tree). */
  isCacheable?: (item: T, index: number) => boolean
  /** Maximum rows in cache buffer. Default: 10_000 */
  capacity?: number
}

/** Search configuration for ListView */
export interface ListViewSearchConfig<T> {
  /** Extract searchable text from an item. When omitted, auto-extracts from rendered content. */
  getText?: (item: T) => string
}

export interface ListViewProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the viewport in rows */
  height: number

  /** Estimated height of each item in rows (fixed or per-index function). Default: 1 */
  estimateHeight?: number | ((index: number) => number)

  /** Render function for each item. Third arg provides cursor metadata. */
  renderItem: (item: T, index: number, meta: ListItemMeta) => React.ReactNode

  /** Index to scroll to (declarative override). When set, wins over the
   * internal viewport anchor and cursor-derived scroll — use for programmatic
   * reveal (search matches, "jump to result", etc.). When undefined, the list
   * follows its internal anchor: wheel over it scrolls the viewport with
   * kinetic momentum (cursor stays put); keyboard cursor moves snap the
   * viewport back to the cursor. */
  scrollTo?: number

  /** Extra items to render beyond viewport for smooth scrolling. Default: 5 */
  overscan?: number

  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number

  /** Padding from edge before scrolling (in items). Default: 2 */
  scrollPadding?: number

  /** Show overflow indicators (▲N/▼N). Default: false */
  overflowIndicator?: boolean

  /** Key extractor (defaults to index) */
  getKey?: (item: T, index: number) => string | number

  /** Width of the viewport (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows. Default: 0 */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /**
   * Called when mouse enters an item. Defaults to moving the cursor to that
   * item (hover-to-focus). Provide a custom handler to override this behavior.
   * Only active when nav=true.
   */
  onItemHover?: (index: number) => void
  /**
   * Called when an item is clicked. Defaults to moving the cursor + firing
   * onSelect (click-to-confirm). Provide a custom handler to override.
   * Only active when nav=true.
   */
  onItemClick?: (index: number) => void

  /** Content rendered after all items inside the scroll container (e.g., hidden count indicator) */
  listFooter?: React.ReactNode

  /** Predicate for items already unmounted (cached, pushed to scrollback).
   * Only a contiguous prefix of matching items is removed from the list. */
  unmounted?: (item: T, index: number) => boolean

  // ── Navigable mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  nav?: boolean

  /** Currently focused cursor key (controlled). Managed internally when not provided. */
  cursorKey?: number

  /** Called when cursor position changes (keyboard or mouse wheel navigation) */
  onCursor?: (index: number) => void

  /** Called when Enter is pressed on the cursor item */
  onSelect?: (index: number) => void

  /** Whether this ListView is active for keyboard input. Default: true.
   * Set to false when another pane has focus in multi-pane layouts. */
  active?: boolean

  // ── History / Surface ─────────────────────────────────────────

  /** Surface identity for search/selection routing */
  surfaceId?: string

  /** Search configuration (true = auto-extract text from rendered content) */
  search?: boolean | ListViewSearchConfig<T>

  /** Cache configuration (true = auto-cache items above viewport) */
  cache?: boolean | ListViewCacheConfig<T>
}

export interface ListViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
  /** Get the history buffer (if history.mode === "virtual") */
  getHistoryBuffer(): HistoryBuffer | null
  /** Get the composed viewport (if history.mode === "virtual") */
  getComposedViewport(): ComposedViewport | null
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ESTIMATE_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100
const DEFAULT_SCROLL_PADDING = 2

// ── Scroll physics: iOS-style momentum + wheel acceleration ────────────
//
// Two phases:
//
//   Wheel phase (user actively scrolling). Each wheel event:
//     - dt since last event → acceleration factor (fast gesture → bigger step)
//     - immediate step (items) for responsiveness
//     - velocity (items/sec) updated via event-sampled estimate
//
//   Momentum phase (no wheel events for RELEASE_TIMEOUT_MS). Closed-form
//   exponential decay, Ariya-Hidayat / UIScrollView shape:
//     amplitude = velocity × τ     // total coast distance
//     target    = pos + amplitude
//     pos(t)    = target − amplitude · exp(−t / τ)
//     stop when t > 6τ (within 0.25% of target — inaudible in row-space)
//
// τ = KINETIC_TIME_CONSTANT_MS. Apple's equivalent decay rate 0.95 per 16.7ms
// frame ↔ τ ≈ 325ms. We use 260ms — a hair snappier for discrete TUI rows
// where overshoot reads sloppier than on iOS's pixel-smooth scroll.

/** Base items per wheel event at the slow end — 1 click = 1 row. */
const WHEEL_BASE_STEP = 1
/** Max wheel acceleration multiplier at short inter-event dt. */
const WHEEL_ACCEL_MAX = 5
/** The dt (ms) at which accel factor = 1. Shorter dt → accel up to MAX. */
const WHEEL_ACCEL_REFERENCE_DT_MS = 180
/** Inter-event dt (ms) beyond which we treat events as isolated single-clicks
 * (no velocity accumulation). Matches macOS system behavior. */
const WHEEL_ISOLATED_DT_MS = 500

/** Max absolute velocity (items/sec). Capped so momentum distance stays
 * trackable in row-space. amplitude_max = MAX_VELOCITY × τ / 1000 in seconds
 * scale — here 60 items/sec × 0.26s ≈ 15 items of max coast. */
const KINETIC_MAX_VELOCITY = 60
/** Momentum time constant (ms). See derivation above. */
const KINETIC_TIME_CONSTANT_MS = 260
/** Stop the momentum animation after this many τ (6τ → within 0.25% of target). */
const KINETIC_STOP_AFTER_TAU_MULTIPLES = 6
/** Stop when remaining distance is below this (items). Prevents stalling at
 * fractional positions after the exponential flattens out. */
const KINETIC_STOP_DISTANCE = 0.5
/** Animation loop period in ms — 60Hz sampling of the closed-form curve. */
const KINETIC_FRAME_MS = 16
/** Wait this long with no wheel events before entering momentum phase. */
const RELEASE_TIMEOUT_MS = 60
/** How long (ms) the scrollbar stays visible after the last scroll activity. */
const SCROLLBAR_FADE_AFTER_MS = 800

// =============================================================================
// Measurement
// =============================================================================

/**
 * Wrapper that measures its child's rendered height after layout.
 * Reports the measurement to the virtualizer via measureItem callback.
 * Uses Box's onLayout prop to get the actual rendered height.
 * Does NOT add any layout of its own — the child determines the height.
 */
function MeasuredItem({
  itemKey,
  measureItem,
  children,
}: {
  itemKey: string | number
  measureItem: (key: string | number, height: number) => boolean
  children: React.ReactNode
}): React.ReactElement {
  // Use a ref to always have the latest key/measureItem without re-subscribing.
  // This avoids creating a new onLayout callback on every render.
  const keyRef = useRef(itemKey)
  keyRef.current = itemKey
  const measureRef = useRef(measureItem)
  measureRef.current = measureItem

  const handleLayout = useCallback((rect: { height: number }) => {
    if (rect.height > 0) {
      measureRef.current(keyRef.current, rect.height)
    }
  }, [])

  // Render children inside a transparent wrapper Box with onLayout.
  // The Box inherits the parent's column layout direction and doesn't
  // constrain the child — it simply provides a node for measurement.
  return (
    <Box flexDirection="column" flexShrink={0} onLayout={handleLayout}>
      {children}
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

// oxlint-disable-next-line complexity/complexity -- React component — JSX ternaries inflate score
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
    onEndReached,
    onEndReachedThreshold,
    listFooter,
    unmounted,
    nav,
    cursorKey: cursorKeyProp,
    onCursor,
    onSelect,
    onItemHover,
    onItemClick,
    active,
    surfaceId,
    search: searchProp,
    cache: cacheProp,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Term context for cache capture width ─────────────────────────
  const term = useContext(TermContext)

  // ── Cache backend context (set by runtime from rendering mode) ───
  const cacheBackendFromContext = useContext(CacheBackendContext)
  const stdoutCtx = useContext(StdoutContext)

  // ── Nav mode: controlled/uncontrolled cursor ─────────
  const isControlled = cursorKeyProp !== undefined
  const [uncontrolledCursor, setUncontrolledCursor] = useState(0)
  const activeCursor = nav ? (isControlled ? cursorKeyProp! : uncontrolledCursor) : -1

  // ── Viewport scroll anchor (decoupled from cursor) ────────────────
  //
  // Wheel events scroll the viewport without dragging the cursor along
  // (mouse follows hover, keyboard moves focus). `viewportAnchor` pins the
  // viewport to a specific item index; null means "follow cursor".
  // `anchorFloatRef` is the sub-item accumulator used by the kinetic loop
  // for smooth momentum; the rendered viewportAnchor is always an integer.
  //
  // `isScrolling` controls the scrollbar thumb visibility; a setTimeout
  // hides it SCROLLBAR_FADE_AFTER_MS after the last wheel activity. The
  // thumb's position is derived from the virtualizer's `leadingHeight` in
  // row space (see render below) so it stays locked to content motion
  // rather than drifting ahead via item-index interpolation.
  const [viewportAnchor, setViewportAnchor] = useState<number | null>(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const anchorFloatRef = useRef<number | null>(null)
  // Velocity in items/sec, sampled from wheel-event position deltas.
  const velocityRef = useRef(0)
  const lastWheelTimeRef = useRef(0)
  // Momentum phase (closed-form exponential decay) state. Populated on
  // release; `null` means "no momentum animation in flight".
  const momentumRef = useRef<{
    startPos: number
    amplitude: number
    startTime: number
  } | null>(null)
  const kineticLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest item count — the wheel/kinetic paths close over a stale items.length
  // on each frame otherwise.
  const itemCountRef = useRef(items.length)
  itemCountRef.current = items.length

  const stopKinetic = useCallback(() => {
    if (kineticLoopRef.current !== null) {
      clearInterval(kineticLoopRef.current)
      kineticLoopRef.current = null
    }
    momentumRef.current = null
  }, [])

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const scheduleScrollbarHide = useCallback(() => {
    if (scrollbarHideTimerRef.current !== null) {
      clearTimeout(scrollbarHideTimerRef.current)
    }
    scrollbarHideTimerRef.current = setTimeout(() => {
      setIsScrolling(false)
      scrollbarHideTimerRef.current = null
    }, SCROLLBAR_FADE_AFTER_MS)
  }, [])

  // Cleanup on unmount.
  useEffect(() => () => {
    stopKinetic()
    clearReleaseTimer()
    if (scrollbarHideTimerRef.current !== null) clearTimeout(scrollbarHideTimerRef.current)
  }, [stopKinetic, clearReleaseTimer])

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      if (!isControlled) setUncontrolledCursor(clamped)
      onCursor?.(clamped)
      // Keyboard/programmatic cursor move → viewport snaps back to cursor.
      // Kill any in-flight wheel/momentum animation and release timer.
      anchorFloatRef.current = null
      setViewportAnchor(null)
      velocityRef.current = 0
      lastWheelTimeRef.current = 0
      stopKinetic()
      clearReleaseTimer()
    },
    [clearReleaseTimer, isControlled, items.length, onCursor, stopKinetic],
  )

  // Closed-form momentum sample — evaluates the exponential decay curve at
  // absolute time t relative to release, returns false when the animation
  // should terminate.
  //
  //   pos(t) = target − amplitude × exp(−t / τ)
  //
  // Where amplitude = v₀ × τ (total coast distance in items) and target
  // is the clamped final position. Stop when t > 6τ or remaining distance
  // is below KINETIC_STOP_DISTANCE — either criterion ensures a clean end.
  const momentumStep = useCallback((): boolean => {
    const m = momentumRef.current
    if (m === null) return false
    const count = itemCountRef.current
    if (count <= 0) return false
    const maxIdx = count - 1
    const tau = KINETIC_TIME_CONSTANT_MS
    const t = performance.now() - m.startTime
    if (t >= tau * KINETIC_STOP_AFTER_TAU_MULTIPLES) return false
    const decay = Math.exp(-t / tau)
    const remaining = m.amplitude * decay
    if (Math.abs(remaining) < KINETIC_STOP_DISTANCE) return false
    let pos = m.startPos + m.amplitude * (1 - decay)
    // Hard clamp at edges — zero-remaining terminates.
    if (pos <= 0) {
      pos = 0
      anchorFloatRef.current = 0
      setViewportAnchor(0)
      return false
    }
    if (pos >= maxIdx) {
      pos = maxIdx
      anchorFloatRef.current = maxIdx
      setViewportAnchor(maxIdx)
      return false
    }
    anchorFloatRef.current = pos
    const rendered = Math.round(pos)
    setViewportAnchor((prev) => (prev === rendered ? prev : rendered))
    return true
  }, [])

  const startMomentum = useCallback(() => {
    if (kineticLoopRef.current !== null) return
    kineticLoopRef.current = setInterval(() => {
      if (!momentumStep()) stopKinetic()
    }, KINETIC_FRAME_MS)
  }, [momentumStep, stopKinetic])

  // Transition from user-driven wheel to closed-form momentum phase: snapshot
  // the current velocity into an exponential decay profile and start animating.
  const enterMomentum = useCallback(() => {
    const v = velocityRef.current
    if (Math.abs(v) < 1) {
      velocityRef.current = 0
      return
    }
    const count = itemCountRef.current
    if (count <= 0) return
    const maxIdx = count - 1
    const startPos = anchorFloatRef.current ?? 0
    // amplitude = v × τ (with τ in seconds)
    const amplitude = v * (KINETIC_TIME_CONSTANT_MS / 1000)
    const rawTarget = startPos + amplitude
    const clampedTarget = Math.max(0, Math.min(maxIdx, rawTarget))
    momentumRef.current = {
      startPos,
      amplitude: clampedTarget - startPos,
      startTime: performance.now(),
    }
    velocityRef.current = 0
    startMomentum()
  }, [startMomentum])

  const scheduleRelease = useCallback(() => {
    clearReleaseTimer()
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null
      enterMomentum()
    }, RELEASE_TIMEOUT_MS)
  }, [clearReleaseTimer, enterMomentum])

  const handleWheel = useCallback(
    ({ deltaY }: { deltaY: number }) => {
      const count = itemCountRef.current
      if (count <= 0) return
      const maxIdx = count - 1
      const now = performance.now()
      const dir = Math.sign(deltaY) || 0
      if (dir === 0) return
      // Cancel any in-flight momentum — user is actively driving again.
      stopKinetic()
      clearReleaseTimer()
      // First wheel event seeds the anchor from the current cursor (nav
      // mode) or 0 (passive mode — cursor is -1).
      if (anchorFloatRef.current === null) {
        anchorFloatRef.current = activeCursor >= 0 ? activeCursor : 0
      }
      // Inter-event dt drives both step size (acceleration) and velocity
      // estimation. Clamp dt to [1ms, ISOLATED] to avoid pathological
      // 0-dt divide-by-zero on coalesced events or stale timestamps after
      // long pauses.
      const rawDt = lastWheelTimeRef.current === 0 ? WHEEL_ISOLATED_DT_MS : now - lastWheelTimeRef.current
      const dt = Math.max(1, Math.min(WHEEL_ISOLATED_DT_MS, rawDt))
      const accel = Math.min(
        WHEEL_ACCEL_MAX,
        Math.max(1, WHEEL_ACCEL_REFERENCE_DT_MS / dt),
      )
      const stepItems = WHEEL_BASE_STEP * accel
      lastWheelTimeRef.current = now
      // Advance anchor immediately — content follows on the next render.
      let nextFloat = anchorFloatRef.current + dir * stepItems
      if (nextFloat < 0) nextFloat = 0
      else if (nextFloat > maxIdx) nextFloat = maxIdx
      anchorFloatRef.current = nextFloat
      const rendered = Math.round(nextFloat)
      setViewportAnchor((prev) => (prev === rendered ? prev : rendered))
      // Velocity estimate: items/sec implied by this single step, capped.
      // An isolated slow click (long dt) yields tiny velocity → negligible
      // momentum after release. A dense trackpad stream (short dt) sustains
      // high velocity → long coast.
      const vSample = dt >= WHEEL_ISOLATED_DT_MS ? 0 : (dir * stepItems) / (dt / 1000)
      velocityRef.current = Math.max(
        -KINETIC_MAX_VELOCITY,
        Math.min(KINETIC_MAX_VELOCITY, vSample),
      )
      // Scrollbar on — auto-hide refreshes on each event.
      setIsScrolling(true)
      scheduleScrollbarHide()
      // After a short pause with no more wheel events, roll current
      // velocity into a closed-form momentum animation.
      scheduleRelease()
    },
    [activeCursor, clearReleaseTimer, scheduleRelease, scheduleScrollbarHide, stopKinetic],
  )

  // Observe search bar state — while the bar is open, the app-wide
  // SearchBindings consumes Enter for "next match". ListView must NOT also
  // fire onSelect (which would open a detail pane or similar). Guarding on
  // isActive keeps the two event consumers from firing together.
  const searchCtx = useSearchOptional()
  const searchActiveRef = useRef(false)
  searchActiveRef.current = searchCtx?.isActive ?? false

  // Keyboard input for nav mode
  useInput(
    (input, key) => {
      if (!nav) return
      const cur = activeCursor
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return && !searchActiveRef.current) onSelect?.(cur)
    },
    { isActive: nav && active !== false },
  )

  // Resolve viewport target in priority order:
  //   1. scrollToProp (declarative override — e.g. programmatic reveal)
  //   2. viewportAnchor (wheel is driving — viewport decoupled from cursor)
  //   3. activeCursor (nav mode default — viewport follows cursor)
  //   4. undefined (passive list with no scroll position opinion)
  const scrollTo =
    scrollToProp !== undefined
      ? scrollToProp
      : viewportAnchor !== null
        ? viewportAnchor
        : nav
          ? activeCursor
          : undefined

  // ── Resolve cache config ─────────────────────────────────────────
  // When cache=true, use "auto" mode which reads CacheBackendContext.
  // When cache={ mode: "auto" }, also reads context. Otherwise use the explicit mode.
  const cacheConfig =
    typeof cacheProp === "object" ? cacheProp : cacheProp ? { mode: "auto" as const } : undefined
  const rawCacheMode = cacheConfig?.mode ?? "none"
  // Resolve "auto" → context-driven backend selection
  const cacheMode =
    rawCacheMode === "auto"
      ? cacheBackendFromContext === "terminal"
        ? "terminal"
        : "virtual"
      : rawCacheMode
  const cacheBufferRef = useRef<HistoryBuffer | null>(null)
  if (cacheMode === "virtual" && !cacheBufferRef.current) {
    cacheBufferRef.current = createHistoryBuffer(cacheConfig?.capacity ?? 10_000)
  }
  const cacheBuffer = cacheBufferRef.current

  // ── Resolve search config ─────────────────────────────────────────
  const searchConfig = typeof searchProp === "object" ? searchProp : searchProp ? {} : undefined
  const getText = searchConfig?.getText ?? (searchConfig ? (item: T) => String(item) : undefined)

  // Compute cached prefix from isCacheable
  let cachedCount = 0
  if ((cacheMode === "virtual" || cacheMode === "terminal") && cacheConfig?.isCacheable) {
    for (let i = 0; i < items.length; i++) {
      if (!cacheConfig.isCacheable(items[i]!, i)) break
      cachedCount++
    }
  }

  // Push newly cached items to buffer or terminal scrollback
  const prevCachedRef = useRef(0)
  if (
    cachedCount > prevCachedRef.current &&
    (cacheMode === "virtual" || cacheMode === "terminal")
  ) {
    const captureWidth = width ?? term?.cols ?? 80
    const canCapture = isLayoutEngineInitialized()
    for (let i = prevCachedRef.current; i < cachedCount; i++) {
      const item = items[i]!
      const key = getKey?.(item, i) ?? i
      let ansi: string
      if (canCapture) {
        // Render the item's element through the pipeline to get real ANSI
        // (borders, padding, colors — everything the user saw)
        try {
          const element = renderItem(item, i, { isCursor: false })
          ansi = renderStringSync(element as React.ReactElement, {
            width: captureWidth,
            plain: false,
            trimTrailingWhitespace: true,
            trimEmptyLines: false,
          })
        } catch {
          // Fallback to plain text if render fails
          ansi = getText?.(item) ?? String(item)
        }
      } else {
        // Layout engine not ready — fallback to plain text
        ansi = getText?.(item) ?? String(item)
      }

      if (cacheMode === "terminal") {
        // Terminal mode: write to stdout as native scrollback via promoteScrollback.
        // The terminal IS the buffer — no need to store in HistoryBuffer.
        const lineCount = ansi.split("\n").length
        stdoutCtx?.promoteScrollback?.(`${ansi}\x1b[K\r\n`, lineCount)
      } else if (cacheBuffer) {
        // Virtual mode: store in HistoryBuffer ring buffer
        cacheBuffer.push(createHistoryItem(key, ansi, captureWidth))
      }
    }
    prevCachedRef.current = cachedCount
  }

  // Merge cached prefix with external unmounted prop.
  // Only unmount cached items when the cache backend can display them:
  // - "terminal": items promoted to real terminal scrollback (inline mode)
  // - "virtual": items stored in HistoryBuffer for virtual scrollback viewer
  // - "retain": items cached but kept in the render tree (plain fullscreen
  //   without virtual scrollback — unmounting would make items invisible)
  const shouldUnmountCached = cacheBackendFromContext !== "retain" && cachedCount > 0
  const effectiveUnmounted = useMemo(() => {
    if (!shouldUnmountCached) return unmounted
    if (!unmounted) {
      return (_item: T, index: number) => index < cachedCount
    }
    return (item: T, index: number) => {
      if (index < cachedCount) return true
      return unmounted(item, index)
    }
  }, [shouldUnmountCached, cachedCount, unmounted])

  // ── Virtual prefix computation ──────────────────────────────────────
  let unmountedCount = 0
  if (effectiveUnmounted) {
    for (let i = 0; i < items.length; i++) {
      if (!effectiveUnmounted(items[i]!, i)) break
      unmountedCount++
    }
  }

  // Slice items to exclude virtual prefix
  const activeItems = unmountedCount > 0 ? items.slice(unmountedCount) : items

  // Adjust scrollTo to account for virtual items
  const adjustedScrollTo =
    scrollTo !== undefined ? Math.max(0, scrollTo - unmountedCount) : undefined

  // ── Adapt estimateHeight for unmounted offset ──────────────────
  const adjustedEstimateHeight = useMemo(() => {
    if (typeof estimateHeight === "number") return estimateHeight
    if (unmountedCount > 0) {
      return (index: number) => estimateHeight(index + unmountedCount)
    }
    return estimateHeight
  }, [estimateHeight, unmountedCount])

  // ── useVirtualizer ──────────────────────────────────────────────
  const wrappedGetKey = useMemo(() => {
    if (!getKey) return undefined
    if (unmountedCount === 0) return (index: number) => getKey(activeItems[index]!, index)
    return (index: number) => getKey(activeItems[index]!, index + unmountedCount)
  }, [getKey, activeItems, unmountedCount])

  // Scroll container AgNode — captured after mount so useVirtualizer can
  // subscribe to layout-phase's scrollState signal. Until the Box mounts
  // (first render), this is null and useVirtualizer uses bootstrap mode.
  const boxHandleRef = useRef<BoxHandle>(null)
  const [containerNode, setContainerNode] = useState<AgNode | null>(null)
  useLayoutEffect(() => {
    const node = boxHandleRef.current?.getNode() ?? null
    setContainerNode(node)
  }, [])

  // Count of trailing extra children rendered between the visible items and
  // the trailing placeholder (listFooter). useVirtualizer uses this to
  // correctly map `scrollState.lastVisibleChild` back to a virtual item.
  const trailingExtraChildren = listFooter != null && listFooter !== false ? 1 : 0

  const {
    range,
    leadingHeight,
    trailingHeight,
    hiddenBefore,
    hiddenAfter,
    scrollOffset,
    scrollToItem,
    measureItem,
    measuredHeights,
  } = useVirtualizer({
    count: activeItems.length,
    estimateHeight: adjustedEstimateHeight,
    viewportHeight: height,
    scrollTo: adjustedScrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
    getItemKey: wrappedGetKey,
    onEndReached,
    onEndReachedThreshold,
    containerNode,
    trailingExtraChildren,
  })

  // ── Surface / search registration ────────────────────────────────
  const textSurfaceRef = useRef<TextSurface | null>(null)
  const composedViewportRef = useRef<ComposedViewport | null>(null)

  // Stable refs for the effect closure to avoid re-running on every items change
  const itemsRef = useRef(items)
  itemsRef.current = items
  const unmountedCountRef = useRef(unmountedCount)
  unmountedCountRef.current = unmountedCount
  const getTextRef = useRef(getText)
  if (getText) getTextRef.current = getText
  const getKeyRef = useRef(getKey)
  getKeyRef.current = getKey

  // Stable ref to scrollToItem so the search reveal closure doesn't go stale
  const scrollToItemRef = useRef(scrollToItem)
  scrollToItemRef.current = scrollToItem

  // Stable ref to moveTo so the search reveal closure can move the nav
  // cursor without stale-closure issues. In nav mode, scrollToItem is a
  // no-op (Box.scrollTo is overridden by activeCursor), so reveal must
  // route through moveTo → onCursor → App's cursor state instead.
  const moveToRef = useRef(moveTo)
  moveToRef.current = moveTo
  const navRef = useRef(nav)
  navRef.current = nav

  // Create and maintain ListDocument + TextSurface when surfaceId is set
  useEffect(() => {
    if (!surfaceId || cacheMode !== "virtual" || !cacheBuffer) return

    const getLiveItems = (): LiveItemBlock[] => {
      const currentItems = itemsRef.current
      const currentUnmountedCount = unmountedCountRef.current
      const currentGetText = getTextRef.current
      const currentGetKey = getKeyRef.current
      const live: LiveItemBlock[] = []
      for (let i = currentUnmountedCount; i < currentItems.length; i++) {
        const item = currentItems[i]!
        const text = currentGetText?.(item) ?? String(item)
        const rows = text.split("\n")
        const plainTextRows = rows.map((r) => stripAnsi(r))
        live.push({
          key: currentGetKey?.(item, i) ?? i,
          itemIndex: i,
          rows,
          plainTextRows,
        })
      }
      return live
    }

    const document = createListDocument(cacheBuffer, getLiveItems)
    const surface = createTextSurface({
      id: surfaceId,
      document,
      viewportToDocument: (viewportRow: number) => viewportRow + cacheBuffer.totalRows,
      onReveal: () => {
        // Could be extended later for scroll-to-row
      },
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    textSurfaceRef.current = surface

    return () => {
      textSurfaceRef.current = null
    }
  }, [surfaceId, cacheMode, cacheBuffer])

  // ── Search registration ──────────────────────────────────────────
  // Register as Searchable in SearchProvider when `search` prop is set.
  // The search function scans all items' text for query matches.
  // The reveal function scrolls the matching item into view.
  //
  // Uses the explicit `surfaceId` when provided (multi-pane routing), and
  // falls back to an auto-generated id from useId so that single-pane
  // apps get a working searchable without boilerplate. The provider's
  // getActiveSearchable() handles both — explicit focusedId wins,
  // otherwise the only registered searchable is selected.
  const autoSearchableId = useId()
  const searchableId = surfaceId ?? autoSearchableId
  useEffect(() => {
    if (!searchConfig || !searchCtx) return

    const searchable = {
      search(query: string): SearchMatch[] {
        if (!query) return []
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        const lowerQuery = query.toLowerCase()
        const matches: SearchMatch[] = []
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lines = text.split("\n")
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx]!
            const lowerLine = line.toLowerCase()
            let col = 0
            while (col < lowerLine.length) {
              const found = lowerLine.indexOf(lowerQuery, col)
              if (found === -1) break
              matches.push({ row: row + lineIdx, startCol: found, endCol: found + query.length })
              col = found + 1
            }
          }
          row += lines.length
        }
        return matches
      },
      reveal(match: SearchMatch): void {
        // Find which item contains this row
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lineCount = text.split("\n").length
          if (match.row < row + lineCount) {
            // Route to the correct consumer:
            //  - nav mode: move the cursor (scrollTo is overridden by
            //    activeCursor in nav mode, so moveTo is the only thing
            //    that actually brings the match into view + lets the
            //    App observe the new position via onCursor).
            //  - passive mode: scroll the viewport.
            if (navRef.current) {
              // moveTo takes original (pre-unmounted) indices — same as
              // items[i]. It clamps internally.
              moveToRef.current(i)
            } else {
              scrollToItemRef.current(Math.max(0, i - unmountedCountRef.current))
            }
            return
          }
          row += lineCount
        }
      },
    }

    return searchCtx.registerSearchable(searchableId, searchable)
  }, [searchConfig, searchCtx, searchableId])

  // Compute composed viewport when history is active
  if (cacheMode === "virtual" && cacheBuffer) {
    composedViewportRef.current = composeViewport({
      history: cacheBuffer,
      viewportHeight: height,
      scrollOffset: 0, // At tail by default; scroll offset would come from external state
    })
  }

  // ── Ref ───────────────────────────────────────────────────────────
  // Wrap scrollToItem to accept original indices (before virtual adjustment)
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - unmountedCount))
      },
      getHistoryBuffer(): HistoryBuffer | null {
        return cacheBufferRef.current
      },
      getComposedViewport(): ComposedViewport | null {
        return composedViewportRef.current
      },
    }),
    [scrollToItem, unmountedCount],
  )

  // ── Mouse wheel handler ─────────────────────────────────────────
  // Wheel over the list scrolls its viewport with iOS-style kinetic
  // momentum (mouse follows hover, keyboard moves focus). Cursor is
  // untouched by scrolling. Any subsequent keyboard cursor move snaps the
  // viewport back to the cursor via `moveTo`. See `handleWheel` +
  // `startKinetic` above for the physics model.
  const onWheel = handleWheel

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

  // STRICT invariant: virtualizer's leadingHeight must equal
  // sumHeights(0, startIndex) — i.e. the placeholder row-count matches the
  // prefix-sum the virtualizer used internally. This catches drift between
  // window-placement math and placeholder-height math (e.g. the divergence
  // that caused the column-top-disappears bug class). Scoped here (not in
  // the hook) because it exercises a user-visible contract that affects
  // overflow math.
  //
  // NOTE: The /pro review's stronger form ("sumHeights(0, virtualizer.scrollOffset)
  // == leadingHeight") does NOT hold in general — the virtualizer's `scrollOffset`
  // is viewport-top-item-index while `startIndex` can sit below it by up to
  // `overscan` items (start = max(0, scrollOffset - overscan)). The stronger
  // form only holds when overscan doesn't pull `start` back (scrollOffset=0 or
  // viewport at count-end). We instead check the always-true internal
  // consistency invariant — any violation points to a virtualizer math bug.
  if (process?.env?.SILVERY_STRICT) {
    const strict = process.env.SILVERY_STRICT
    const shouldThrow = strict === "2"
    const expectedLeading = sumHeights(
      0,
      startIndex,
      adjustedEstimateHeight,
      gap,
      measuredHeights,
      wrappedGetKey,
    )
    // Allow 1 row of floating-point slack for avgMeasured fallback divisions.
    if (Math.abs(leadingHeight - expectedLeading) > 1) {
      const msg =
        `[SILVERY_STRICT] ListView leadingHeight ${leadingHeight} diverges from ` +
        `sumHeights(0, startIndex=${startIndex})=${expectedLeading} ` +
        `(scrollOffset=${scrollOffset}, count=${activeItems.length})`
      if (shouldThrow) throw new Error(msg)
      else console.warn(msg)
    }
  }

  // Calculate scrollTo index for silvery Box overflow="scroll"
  const hasTopPlaceholder = leadingHeight > 0
  const currentScrollTarget =
    adjustedScrollTo !== undefined
      ? Math.max(0, Math.min(adjustedScrollTo, activeItems.length - 1))
      : scrollOffset
  const selectedIndexInSlice = currentScrollTarget - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice
  const boxScrollTo = isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined

  // Scrollbar geometry — indexed on ROW (vertical position), not item#.
  // Item-indexed thumb jumps erratically when item heights vary, because
  // "50% through the items" is not "50% through the rendered content"
  // when early items are tall and late items short (or vice-versa).
  //
  //   totalRows     = sum of every item's measured row height (or its
  //                   estimate for unmeasured items). Stable across a
  //                   scroll — depends on count + measurement cache only,
  //                   not on the render window.
  //   scrollable    = totalRows − trackHeight (rows the user can reveal
  //                   by scrolling, excluding the always-visible viewport).
  //   thumbHeight   = trackHeight × trackHeight / totalRows
  //                   (viewport fraction of total, CSS-scrollbar shape).
  //   thumbTop      = trackRemainder × leadingHeight / scrollable
  //                   (row offset of viewport top → thumb top).
  //
  // `leadingHeight` comes from the virtualizer and is the measured row
  // offset above the first visible item — this is exactly what a browser
  // scrollbar uses, so tall items before the viewport correctly push the
  // thumb further down than short ones.
  const trackHeight = Math.max(1, height)
  const totalRows = Math.max(
    1,
    sumHeights(
      0,
      activeItems.length,
      adjustedEstimateHeight,
      gap,
      measuredHeights,
      wrappedGetKey,
    ),
  )
  // Rows scrolled past the viewport top — the exact measurement a browser
  // uses for scrollbar position. `leadingHeight` from the virtualizer is
  // `sumHeights(0, startIndex)` where startIndex = scrollOffset − overscan,
  // so it underestimates "rows above viewport" by the overscan window and
  // lags the thumb behind the content. Use `scrollOffset` (viewport-top
  // item index) + sumHeights directly.
  const rowsAboveViewport = sumHeights(
    0,
    scrollOffset,
    adjustedEstimateHeight,
    gap,
    measuredHeights,
    wrappedGetKey,
  )
  const thumbHeight =
    totalRows > trackHeight
      ? Math.max(1, Math.floor((trackHeight * trackHeight) / totalRows))
      : 0
  const scrollableRows = Math.max(1, totalRows - trackHeight)
  const trackRemainder = trackHeight - thumbHeight
  // Clamp position to [0, trackRemainder] — thumb is always fully visible
  // within the track, never over-runs top or bottom. Content clamp lives
  // in `kineticStep` (anchor clamped to [0, maxIdx], velocity zeroed at
  // edges — no rubber-band overshoot).
  const clampedFrac =
    scrollableRows > 0 ? Math.max(0, Math.min(1, rowsAboveViewport / scrollableRows)) : 0
  const thumbTop =
    thumbHeight > 0 ? Math.max(0, Math.min(trackRemainder, Math.round(clampedFrac * trackRemainder))) : 0
  const showScrollbar = isScrolling && thumbHeight > 0 && thumbHeight < trackHeight

  return (
    <Box position="relative" flexDirection="column" height={height} width={width}>
    <Box
      ref={boxHandleRef}
      flexDirection="column"
      height={height}
      width={width}
      overflow="scroll"
      scrollTo={boxScrollTo}
      overflowIndicator={overflowIndicator}
      onWheel={onWheel}
    >
      {/* Leading placeholder for virtual height.
       *
       * `representsItems` tells the parent scroll container that this one
       * placeholder Box stands in for `hiddenBefore` (= startIndex) logical
       * items — so when it's fully scrolled above the viewport, the parent's
       * `hiddenAbove` is incremented by that count (→ `▲N` shows real items).
       * Without this, the ▲N indicator would always say `1` while many items
       * are actually above the render window. */}
      {leadingHeight > 0 && (
        <Box height={leadingHeight} flexShrink={0} representsItems={hiddenBefore} />
      )}

      {/* Render visible items with height measurement */}
      {visibleItems.map((item, i) => {
        const originalIndex = startIndex + i + unmountedCount
        const key = getKey ? getKey(item, originalIndex) : startIndex + i
        const isLast = i === visibleItems.length - 1
        const meta: ListItemMeta = { isCursor: originalIndex === activeCursor }
        // Use wrappedGetKey (index within activeItems) for measurement cache
        const measureKey = wrappedGetKey ? wrappedGetKey(startIndex + i) : startIndex + i

        // In nav mode, wrap each item with hover/click handlers so that
        // hovering moves the keyboard cursor and clicking confirms the
        // selection. The wrapper is always added when nav is on and active
        // — previously it was only added when the app provided
        // onItemHover/onItemClick explicitly, which meant hover silently
        // did nothing for apps that wanted the defaults.
        const rendered = renderItem(item, originalIndex, meta)
        const itemNode =
          nav && active !== false ? (
            <Box
              onMouseEnter={
                onItemHover ? () => onItemHover(originalIndex) : () => moveTo(originalIndex)
              }
              onClick={
                onItemClick
                  ? () => onItemClick(originalIndex)
                  : () => {
                      moveTo(originalIndex)
                      onSelect?.(originalIndex)
                    }
              }
            >
              {rendered}
            </Box>
          ) : (
            rendered
          )

        return (
          <React.Fragment key={key}>
            <MeasuredItem itemKey={measureKey} measureItem={measureItem}>
              {itemNode}
            </MeasuredItem>
            {!isLast && renderSeparator && renderSeparator()}
            {!isLast && gap > 0 && !renderSeparator && <Box height={gap} flexShrink={0} />}
          </React.Fragment>
        )
      })}

      {/* Footer content (e.g., filter hidden count) */}
      {listFooter}

      {/* Trailing placeholder for virtual height.
       *
       * See leading placeholder above for why `representsItems` is set — the
       * trailing version covers `hiddenAfter` (= count - endIndex) items that
       * are beyond the render window on the bottom side. */}
      {trailingHeight > 0 && (
        <Box height={trailingHeight} flexShrink={0} representsItems={hiddenAfter} />
      )}
    </Box>
    {/* Scrollbar overlay — absolute-positioned on the right edge so it
     * doesn't steal a column from content. Track is implicit (transparent);
     * only the thumb draws. Position updates every kinetic frame so it
     * slides smoothly even between integer-anchor content updates. */}
    {showScrollbar && (
      <>
        <Box
          position="absolute"
          top={0}
          right={0}
          width={1}
          height={trackHeight}
        />
        <Box
          position="absolute"
          top={thumbTop}
          right={0}
          width={1}
          height={thumbHeight}
          backgroundColor="$muted"
        />
      </>
    )}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const ListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.ForwardedRef<ListViewHandle> },
) => React.ReactElement
