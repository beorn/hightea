/**
 * Pretext: Grapheme-indexed text analysis for O(log n) layout queries.
 *
 * Inspired by https://chenglou.me/pretext/ — prepare text once, measure at
 * any width cheaply. Enables layout algorithms CSS can't express:
 *
 * - **Shrinkwrap**: find the narrowest width that keeps the same line count
 *   (tighter than CSS fit-content, eliminates dead space in bubbles/cards)
 * - **Balanced**: equalize line widths (reduce raggedness without Knuth-Plass)
 * - **Knuth-Plass**: optimal paragraph breaking (minimize total raggedness)
 * - **Height prediction**: exact line count at any width without full wrapping
 *
 * All algorithms operate on the same TextAnalysis data structure, which is
 * built once from ANSI-aware graphemes and cached per text node via PreparedText.
 *
 * Terminal widths are integers, so binary search for shrinkwrap does at most
 * log2(120) ≈ 7 iterations. Each iteration is O(graphemes). Total: O(7 × N)
 * where N is grapheme count — microseconds for typical terminal text.
 */

import {
  graphemeWidth as defaultGraphemeWidth,
  splitGraphemesAnsiAware,
  isWordBoundary,
  canBreakAnywhere,
} from "../unicode"

// ============================================================================
// Types
// ============================================================================

/** Grapheme-level text analysis for fast width queries. */
export interface TextAnalysis {
  /** ANSI-aware graphemes (visible chars + zero-width ANSI tokens). */
  graphemes: string[]
  /** Display width per grapheme (0 for ANSI tokens). */
  widths: number[]
  /** Prefix sums: cumWidths[i] = sum(widths[0..i-1]). cumWidths[0] = 0. */
  cumWidths: number[]
  /** Total display width of all graphemes. */
  totalWidth: number
  /** Width of the widest unbreakable word segment. Lower bound for shrinkwrap. */
  maxWordWidth: number
  /** Grapheme indices where newlines occur. */
  newlineIndices: number[]
  /**
   * Grapheme indices where word breaks are legal.
   * After spaces/hyphens (index = char after boundary).
   * Before CJK chars (index = the CJK char itself).
   */
  breakIndices: number[]
}

// ============================================================================
// Build
// ============================================================================

/**
 * Build text analysis from an ANSI-embedded text string.
 * O(N) where N is grapheme count. Call once per text change (cached by PreparedText).
 */
export function buildTextAnalysis(text: string, gWidthFn: (g: string) => number = defaultGraphemeWidth): TextAnalysis {
  const graphemes = splitGraphemesAnsiAware(text)
  const len = graphemes.length
  const widths = new Array<number>(len)
  const cumWidths = new Array<number>(len + 1)
  const newlineIndices: number[] = []
  const breakIndices: number[] = []

  cumWidths[0] = 0
  let maxWordWidth = 0
  let currentWordWidth = 0

  for (let i = 0; i < len; i++) {
    const g = graphemes[i]!
    const w = gWidthFn(g)
    widths[i] = w
    cumWidths[i + 1] = cumWidths[i]! + w

    if (g === "\n") {
      newlineIndices.push(i)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (isWordBoundary(g)) {
      // Break AFTER space/hyphen: next grapheme starts a new word
      breakIndices.push(i + 1)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (canBreakAnywhere(g)) {
      // Break BEFORE CJK: this char can start a new line
      breakIndices.push(i)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = w
    } else if (w > 0) {
      currentWordWidth += w
    }
  }
  maxWordWidth = Math.max(maxWordWidth, currentWordWidth)

  return {
    graphemes,
    widths,
    cumWidths,
    totalWidth: cumWidths[len]!,
    maxWordWidth,
    newlineIndices,
    breakIndices,
  }
}

// ============================================================================
// Line counting (fast, no string allocation)
// ============================================================================

/**
 * Count how many lines text would occupy at a given width.
 * Uses greedy word-wrap algorithm matching wrapTextWithMeasurer behavior.
 * O(graphemes) per call — no string allocation.
 */
export function countLinesAtWidth(analysis: TextAnalysis, width: number): number {
  if (width <= 0) return Infinity
  const { widths, totalWidth, newlineIndices } = analysis
  if (totalWidth <= width && newlineIndices.length === 0) return 1

  let lines = 1
  let currentWidth = 0
  let lastBreakWidth = -1 // width at last break opportunity
  let hasBreak = false

  // Build a set for O(1) newline lookup
  const newlineSet = newlineIndices.length > 0 ? new Set(newlineIndices) : null
  // Build a set for O(1) break lookup
  const breakSet = analysis.breakIndices.length > 0 ? new Set(analysis.breakIndices) : null

  for (let i = 0; i < widths.length; i++) {
    // Newline forces a line break (check before width skip — newlines have width 0)
    if (newlineSet?.has(i)) {
      lines++
      currentWidth = 0
      hasBreak = false
      lastBreakWidth = -1
      continue
    }

    const w = widths[i]!
    if (w === 0) continue // ANSI token

    // Track break opportunities
    if (breakSet?.has(i)) {
      lastBreakWidth = currentWidth
      hasBreak = true
    }

    // Would this grapheme overflow?
    if (currentWidth + w > width) {
      lines++
      if (hasBreak && lastBreakWidth >= 0) {
        // Rewind to last break: the remaining width from break to current
        currentWidth = currentWidth - lastBreakWidth + w
      } else {
        // Character wrap
        currentWidth = w
      }
      hasBreak = false
      lastBreakWidth = -1
    } else {
      currentWidth += w
    }
  }

  return lines
}

// ============================================================================
// Shrinkwrap
// ============================================================================

/**
 * Find the narrowest integer width that produces the same line count as maxWidth.
 *
 * CSS fit-content uses the widest wrapped line — leaving dead space when the
 * last line is short. Shrinkwrap binary-searches for the tightest width that
 * keeps the same number of lines, eliminating wasted area in bubbles/cards.
 *
 * O(log(maxWidth) × graphemes) — ~7 iterations × N for terminal widths.
 */
export function shrinkwrapWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const targetLineCount = countLinesAtWidth(analysis, maxWidth)
  if (targetLineCount <= 1) {
    // Single line — tightest width is the total text width (or maxWidth if smaller)
    return Math.min(Math.ceil(analysis.totalWidth), maxWidth)
  }

  // Binary search: find narrowest width where lineCount <= targetLineCount
  // Lower bound: widest unbreakable word (can't go narrower without adding lines)
  let lo = Math.max(1, analysis.maxWordWidth)
  let hi = maxWidth

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (countLinesAtWidth(analysis, mid) <= targetLineCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  return lo
}

// ============================================================================
// Balanced breaking
// ============================================================================

/**
 * Find a width that produces lines of approximately equal length.
 *
 * Strategy: compute total width, divide by target line count, then
 * find the narrowest width at that line count via shrinkwrap.
 * Falls back to maxWidth if balanced width would increase line count.
 */
export function balancedWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const lineCount = countLinesAtWidth(analysis, maxWidth)
  if (lineCount <= 1) return Math.min(Math.ceil(analysis.totalWidth), maxWidth)

  // Ideal balanced width: total / lines, rounded up
  const idealWidth = Math.ceil(analysis.totalWidth / lineCount)

  // Clamp to [maxWordWidth, maxWidth]
  const candidateWidth = Math.max(analysis.maxWordWidth, Math.min(idealWidth, maxWidth))

  // Verify this doesn't increase line count
  if (countLinesAtWidth(analysis, candidateWidth) > lineCount) {
    // Balanced width would add lines — use shrinkwrap instead
    return shrinkwrapWidth(analysis, maxWidth)
  }

  // Further tighten via shrinkwrap at the balanced line count
  return shrinkwrapWidth(analysis, candidateWidth)
}
