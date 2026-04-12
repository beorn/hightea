/**
 * Phase 1: Measure Phase
 *
 * Handle fit-content nodes by measuring their intrinsic content size.
 */

import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { displayWidthAnsi, graphemeWidth, wrapText, getActiveLineHeight } from "../unicode"
import { collectPlainText as collectTextContent } from "./collect-text"
import { getCachedPlainText, setCachedPlainText, getCachedAnalysis, setCachedAnalysis } from "./prepared-text"
import { buildTextAnalysis, shrinkwrapWidth } from "./pretext"
import { getBorderSize, getPadding } from "./helpers"
import type { PipelineContext } from "./types"

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(root: AgNode, ctx?: PipelineContext): void {
  traverseTree(root, (node) => {
    // Skip nodes without Yoga (raw text nodes)
    if (!node.layoutNode) return

    const props = node.props as BoxProps

    const isFitContent = props.width === "fit-content" || props.height === "fit-content"
    const isSnugContent = props.width === "snug-content"

    if (isFitContent || isSnugContent) {
      // Pass an available-width constraint to child measurement whenever a
      // definite upper bound exists — either a fixed width (height="fit-content"
      // + width:number case) or a maxWidth cap on the fit-content/snug-content
      // box itself. Without this, text nodes measure their full intrinsic
      // unwrapped width, which:
      //   - inflates fit-content boxes beyond maxWidth (measure phase then
      //     uses intrinsic instead of maxWidth as the content bound)
      //   - defeats snug-content's binary search (it starts from an unclamped
      //     upper bound where everything fits on one line, so shrunk ≈ intrinsic)
      let availableWidth: number | undefined
      const widthIsFixed = typeof props.width === "number"
      const definiteUpperWidth =
        widthIsFixed && props.height === "fit-content"
          ? (props.width as number)
          : typeof props.maxWidth === "number"
            ? (props.maxWidth as number)
            : undefined
      if (definiteUpperWidth !== undefined) {
        const padding = getPadding(props)
        availableWidth = definiteUpperWidth - padding.left - padding.right
        if (props.borderStyle) {
          const border = getBorderSize(props)
          availableWidth -= border.left + border.right
        }
        if (availableWidth < 1) availableWidth = 1
      }

      const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth)

      if (isSnugContent) {
        // Fit-snug: find the narrowest width that keeps the same line count.
        // First get the text for analysis, then binary search for tightest width.
        const shrunkWidth = computeSnugContentWidth(node, intrinsicSize.width, ctx)
        node.layoutNode.setWidth(shrunkWidth)
      } else if (props.width === "fit-content") {
        node.layoutNode.setWidth(intrinsicSize.width)
      }
      if (props.height === "fit-content") {
        node.layoutNode.setHeight(intrinsicSize.height)
      }
    }
  })
}

/**
 * Measure the intrinsic size of a node's content.
 *
 * For text nodes: measures the text width and line count.
 * For box nodes: recursively measures children based on flex direction.
 *
 * @param availableWidth - When set, text nodes wrap at this width for height calculation.
 *   Used when a container has fixed width + fit-content height.
 */
function measureIntrinsicSize(
  node: AgNode,
  ctx?: PipelineContext,
  availableWidth?: number,
): {
  width: number
  height: number
} {
  const props = node.props as BoxProps

  // display="none" nodes have 0x0 intrinsic size
  if (props.display === "none") {
    return { width: 0, height: 0 }
  }

  if (node.type === "silvery-text") {
    const textProps = props as TextProps
    // PreparedText cache: reuse plain text from previous frames when content unchanged
    const cached = getCachedPlainText(node)
    let text: string
    if (cached) {
      text = cached.text
    } else {
      text = collectTextContent(node)
      const lineCount = (text.match(/\n/g)?.length ?? 0) + 1
      setCachedPlainText(node, text, lineCount)
    }

    // Apply internal_transform if present (used by Transform component).
    // The transform is applied per-line, which can change the width.
    const transform = textProps.internal_transform
    let lines: string[]

    if (availableWidth !== undefined && availableWidth > 0 && isWrapEnabled(textProps.wrap)) {
      // Wrap text at available width to compute correct height
      lines = ctx ? ctx.measurer.wrapText(text, availableWidth, true, true) : wrapText(text, availableWidth, true, true)
    } else {
      lines = text.split("\n")
    }

    if (transform) {
      lines = lines.map((line, index) => transform(line, index))
    }

    const width = Math.max(...lines.map((line) => getTextWidth(line, ctx)))
    return {
      width,
      height: lines.length * getActiveLineHeight(),
    }
  }

  // For boxes, measure based on flex direction
  const isRow = props.flexDirection === "row" || props.flexDirection === "row-reverse"

  let width = 0
  let height = 0

  let childCount = 0
  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child, ctx, availableWidth)
    childCount++

    if (isRow) {
      width += childSize.width
      height = Math.max(height, childSize.height)
    } else {
      width = Math.max(width, childSize.width)
      height += childSize.height
    }
  }

  // Add gap between children
  const gap = (props.gap as number) ?? 0
  if (gap > 0 && childCount > 1) {
    const totalGap = gap * (childCount - 1)
    if (isRow) {
      width += totalGap
    } else {
      height += totalGap
    }
  }

  // Add padding
  const padding = getPadding(props)
  width += padding.left + padding.right
  height += padding.top + padding.bottom

  // Add border
  if (props.borderStyle) {
    const border = getBorderSize(props)
    width += border.left + border.right
    height += border.top + border.bottom
  }

  return { width, height }
}

/**
 * Check if text wrapping is enabled for a text node.
 */
function isWrapEnabled(wrap: TextProps["wrap"]): boolean {
  return wrap === "wrap" || wrap === "hard" || wrap === "even" || wrap === true || wrap === undefined
}

/**
 * Compute snug-content width for a node.
 * Uses Pretext analysis to binary-search for the tightest width
 * that keeps the same line count as the fit-content width.
 */
function computeSnugContentWidth(node: AgNode, fitContentWidth: number, ctx?: PipelineContext): number {
  const props = node.props as BoxProps

  // Subtract padding + border from fitContentWidth to get CONTENT width.
  // measureIntrinsicSize includes padding+border in its result, but
  // shrinkwrapWidth operates on text content width only.
  let overhead = 0
  const padding = getPadding(props)
  overhead += padding.left + padding.right
  if (props.borderStyle) {
    const border = getBorderSize(props)
    overhead += border.left + border.right
  }
  const contentWidth = fitContentWidth - overhead

  // Get or build text analysis
  let analysis = getCachedAnalysis(node)
  if (!analysis) {
    const cached = getCachedPlainText(node)
    const text = cached ? cached.text : collectTextContent(node)
    const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth
    analysis = buildTextAnalysis(text, gWidthFn)
    setCachedAnalysis(node, analysis)
    if (!cached) {
      const lineCount = (text.match(/\n/g)?.length ?? 0) + 1
      setCachedPlainText(node, text, lineCount)
    }
  }

  // Shrinkwrap the content, then add overhead back
  return shrinkwrapWidth(analysis, contentWidth) + overhead
}

/**
 * Traverse tree in depth-first order.
 */
function traverseTree(node: AgNode, callback: (node: AgNode) => void): void {
  callback(node)
  for (const child of node.children) {
    traverseTree(child, callback)
  }
}

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string, ctx?: PipelineContext): number {
  if (ctx) return ctx.measurer.displayWidthAnsi(text)
  return displayWidthAnsi(text)
}

// collectTextContent is imported from ./collect-text as collectPlainText.
// Previously duplicated here; now shared across measure-phase, render-text,
// and the reconciler's measure function.
