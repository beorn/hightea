/**
 * Ag — tree + layout engine + renderer.
 *
 * Decomposes the opaque executeRender() into two independent phases:
 * - ag.layout(dims) — measure + flexbox → positions/sizes
 * - ag.render() — positioned tree → cell grid → TextFrame
 *
 * The output phase (buffer → ANSI) is NOT part of ag — it lives in term.paint().
 *
 * @example
 * ```ts
 * const ag = createAg(root, { measurer })
 * ag.layout({ cols: 80, rows: 24 })
 * const { frame, buffer } = ag.render()
 * const output = term.paint(buffer, prevBuffer)
 * ```
 */

import { createLogger } from "loggily"
import type { AgNode } from "@silvery/ag/types"
import type { TextFrame } from "@silvery/ag/text-frame"
import { type TerminalBuffer, createTextFrame } from "./buffer"
import { runWithMeasurer, type Measurer } from "./unicode"
import { measurePhase } from "./pipeline/measure-phase"
import {
  layoutPhase,
  scrollPhase,
  stickyPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "./pipeline/layout-phase"
import { renderPhase, clearBgConflictWarnings } from "./pipeline/render-phase"
import type { PipelineContext } from "./pipeline/types"

const log = createLogger("silvery:pipeline")
const baseLog = createLogger("@silvery/ag-react")

// =============================================================================
// Types
// =============================================================================

export interface AgLayoutOptions {
  skipLayoutNotifications?: boolean
  skipScrollStateUpdates?: boolean
}

export interface AgRenderOptions {
  /** Force fresh render — no incremental, doesn't update internal prevBuffer. */
  fresh?: boolean
  /** Override prevBuffer for this render (bypasses internal tracking). */
  prevBuffer?: TerminalBuffer | null
}

export interface AgRenderResult {
  /** Immutable TextFrame snapshot of the rendered output. */
  readonly frame: TextFrame
  /** Raw buffer for output-phase diffing. Internal — prefer frame for reading. */
  readonly buffer: TerminalBuffer
  /** Previous frame's buffer (null on first render). For output-phase diffing. */
  readonly prevBuffer: TerminalBuffer | null
}

export interface Ag {
  /** The root AgNode tree. */
  readonly root: AgNode

  /**
   * Run layout phases: measure → flexbox → scroll → sticky → screenRect → notify.
   * Mutates layout nodes in place.
   */
  layout(dims: { cols: number; rows: number }, options?: AgLayoutOptions): void

  /**
   * Run the render phase: positioned tree → cell grid → TextFrame.
   * Uses internal prevBuffer for incremental rendering.
   * Returns frame (public read API) + buffer/prevBuffer (for output phase).
   */
  render(options?: AgRenderOptions): AgRenderResult

  /** Reset internal prevBuffer (call on resize — forces fresh render next frame). */
  resetBuffer(): void
}

export interface CreateAgOptions {
  /** Width measurer scoped to terminal capabilities. */
  measurer?: Measurer
}

// =============================================================================
// Factory
// =============================================================================

export function createAg(root: AgNode, options?: CreateAgOptions): Ag {
  const measurer = options?.measurer
  const ctx: PipelineContext | undefined = measurer ? { measurer } : undefined
  let _prevBuffer: TerminalBuffer | null = null

  function doLayout(
    cols: number,
    rows: number,
    opts?: AgLayoutOptions,
  ): { tMeasure: number; tLayout: number; tScroll: number; tScreenRect: number; tNotify: number } {
    using render = baseLog.span("pipeline", { width: cols, height: rows })

    let tMeasure: number
    {
      using _m = render.span("measure")
      const t = performance.now()
      measurePhase(root, ctx)
      tMeasure = performance.now() - t
      log.debug?.(`measure: ${tMeasure.toFixed(2)}ms`)
    }

    let tLayout: number
    {
      using _l = render.span("layout")
      const t = performance.now()
      layoutPhase(root, cols, rows)
      tLayout = performance.now() - t
      log.debug?.(`layout: ${tLayout.toFixed(2)}ms`)
    }

    let tScroll: number
    {
      using _s = render.span("scroll")
      const t = performance.now()
      scrollPhase(root, { skipStateUpdates: opts?.skipScrollStateUpdates })
      tScroll = performance.now() - t
    }

    stickyPhase(root)

    let tScreenRect: number
    {
      using _r = render.span("screenRect")
      const t = performance.now()
      screenRectPhase(root)
      tScreenRect = performance.now() - t
    }

    let tNotify = 0
    if (!opts?.skipLayoutNotifications) {
      using _n = render.span("notify")
      const t = performance.now()
      notifyLayoutSubscribers(root)
      tNotify = performance.now() - t
    }

    return { tMeasure, tLayout, tScroll, tScreenRect, tNotify }
  }

  function doRender(opts?: AgRenderOptions): AgRenderResult & { tContent: number } {
    clearBgConflictWarnings()
    const prevBuffer = opts?.fresh ? null : opts?.prevBuffer !== undefined ? opts.prevBuffer : _prevBuffer

    let tContent: number
    let buffer: TerminalBuffer
    {
      const t = performance.now()
      buffer = renderPhase(root, prevBuffer, ctx)
      tContent = performance.now() - t
      log.debug?.(`content: ${tContent.toFixed(2)}ms`)
    }

    // Only save for incremental — fresh renders (STRICT comparison) don't update state
    if (!opts?.fresh) {
      _prevBuffer = buffer
    }

    const frame = createTextFrame(buffer)
    return { frame, buffer, prevBuffer, tContent }
  }

  return {
    root,

    layout(dims, options) {
      if (measurer) {
        runWithMeasurer(measurer, () => doLayout(dims.cols, dims.rows, options))
      } else {
        doLayout(dims.cols, dims.rows, options)
      }
    },

    render(options) {
      const result = measurer ? runWithMeasurer(measurer, () => doRender(options)) : doRender(options)
      return { frame: result.frame, buffer: result.buffer, prevBuffer: result.prevBuffer }
    },

    resetBuffer() {
      _prevBuffer = null
    },
  }
}
