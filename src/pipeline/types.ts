/**
 * Shared types for the Inkx render pipeline.
 */

import type { Cell } from "../buffer.js"
import type { Measurer } from "../unicode.js"

/**
 * Context threaded through the render pipeline.
 *
 * Carries per-render resources that were previously accessed via module-level
 * globals (e.g., `_scopedMeasurer` + `runWithMeasurer()`). Threading context
 * explicitly eliminates save/restore patterns and makes the pipeline pure.
 *
 * Phase 1: measurer only. Phase 2: NodeRenderState for per-node params.
 */
export interface PipelineContext {
  readonly measurer: Measurer
}

/**
 * Clip bounds for viewport clipping.
 */
export type ClipBounds = { top: number; bottom: number; left?: number; right?: number }

/**
 * Per-node render state that changes at each tree level.
 *
 * Groups the parameters that vary per-node during tree traversal:
 * - scrollOffset: accumulated scroll offset from scroll containers
 * - clipBounds: viewport clipping rectangle (from overflow containers)
 * - hasPrevBuffer: whether the buffer was cloned from a previous frame
 * - ancestorCleared: whether an ancestor already cleared this node's region
 *
 * Contrast with frame-scoped params (buffer, ctx) which stay the same
 * for the entire render pass.
 */
export interface NodeRenderState {
  scrollOffset: number
  clipBounds?: ClipBounds
  hasPrevBuffer: boolean
  ancestorCleared: boolean
}

/**
 * Cell change for diffing.
 */
export interface CellChange {
  x: number
  y: number
  cell: Cell
}

/**
 * Border character sets.
 */
export interface BorderChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}
