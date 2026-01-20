/**
 * Phase 3: Content Phase
 *
 * Render all nodes to a terminal buffer.
 */

import { type Color, type Style, TerminalBuffer } from '../buffer.js';
import type { BoxProps, ComputedLayout, InkxNode, TextProps } from '../types.js';
import {
	type StyledSegment,
	displayWidthAnsi,
	graphemeWidth,
	hasAnsi,
	parseAnsiText,
	splitGraphemes,
} from '../unicode.js';
import type { BorderChars } from './types.js';

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root InkxNode
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(root: InkxNode): TerminalBuffer {
	const layout = root.computedLayout;
	if (!layout) {
		throw new Error('contentPhase called before layout phase');
	}

	const buffer = new TerminalBuffer(layout.width, layout.height);
	renderNodeToBuffer(root, buffer);
	return buffer;
}

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
	node: InkxNode,
	buffer: TerminalBuffer,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const layout = node.computedLayout;
	if (!layout) return;

	// Skip nodes without Yoga (raw text and virtual text nodes)
	// Their content is rendered by their parent inkx-text via collectTextContent()
	if (!node.layoutNode) return;

	const props = node.props as BoxProps & TextProps;

	// Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
	// Also skip their children since the entire subtree is hidden
	if (props.display === 'none') return;

	// Check if this is a scrollable container
	const isScrollContainer = props.overflow === 'scroll' && node.scrollState;

	// Render based on node type
	if (node.type === 'inkx-box') {
		renderBox(node, buffer, layout, props, clipBounds);

		// If scrollable, render overflow indicators
		if (isScrollContainer && node.scrollState) {
			renderScrollIndicators(node, buffer, layout, props, node.scrollState);
		}
	} else if (node.type === 'inkx-text') {
		renderText(node, buffer, layout, props, scrollOffset, clipBounds);
	}

	// Render children
	if (isScrollContainer && node.scrollState) {
		// For scroll containers, only render visible children with offset
		const ss = node.scrollState;
		const border = props.borderStyle
			? getBorderSize(props)
			: { top: 0, bottom: 0, left: 0, right: 0 };
		const padding = getPadding(props);

		// Set up clip bounds for children
		const nodeClip = {
			top: layout.y + border.top + padding.top,
			bottom: layout.y + layout.height - border.bottom - padding.bottom,
		};
		// Intersect with parent clip bounds if present
		const childClipBounds = clipBounds
			? {
					top: Math.max(clipBounds.top, nodeClip.top),
					bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
				}
			: nodeClip;

		// First pass: render non-sticky visible children with scroll offset
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			const childProps = child.props as BoxProps;

			// Skip sticky children - they're rendered in second pass
			if (childProps.position === 'sticky') {
				continue;
			}

			// Skip children that are completely outside the visible range
			if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) {
				continue;
			}

			// Render visible children with scroll offset applied
			renderNodeToBuffer(child, buffer, ss.offset, childClipBounds);
		}

		// Second pass: render sticky children at their computed positions
		// Rendered last so they appear on top of other content
		if (ss.stickyChildren) {
			for (const sticky of ss.stickyChildren) {
				const child = node.children[sticky.index];
				if (!child || !child.computedLayout) continue;

				// Calculate the scroll offset that would place the child at its sticky position
				// stickyOffset = naturalTop - renderOffset
				// This makes the child render at renderOffset instead of its natural position
				const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset;

				renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds);
			}
		}
	} else {
		// For overflow='hidden' containers, calculate clip bounds
		let effectiveClipBounds = clipBounds;
		if (props.overflow === 'hidden') {
			const border = props.borderStyle
				? getBorderSize(props)
				: { top: 0, bottom: 0, left: 0, right: 0 };
			const padding = getPadding(props);
			const nodeClip = {
				top: layout.y + border.top + padding.top,
				bottom: layout.y + layout.height - border.bottom - padding.bottom,
			};
			// Intersect with parent clip bounds if present
			if (clipBounds) {
				effectiveClipBounds = {
					top: Math.max(clipBounds.top, nodeClip.top),
					bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
				};
			} else {
				effectiveClipBounds = nodeClip;
			}
		}
		// Normal rendering - render all children with effective clip bounds
		for (const child of node.children) {
			renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds);
		}
	}

	// Clear content dirty flag
	node.contentDirty = false;
}

/**
 * Render scroll indicators on the border (e.g., "---42---" / "---42---").
 * Renders indicators directly on the border line for a cleaner look.
 */
function renderScrollIndicators(
	_node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: BoxProps,
	ss: NonNullable<InkxNode['scrollState']>,
): void {
	const border = props.borderStyle
		? getBorderSize(props)
		: { top: 0, bottom: 0, left: 0, right: 0 };

	const indicatorStyle: Style = {
		fg: props.borderColor ? parseColor(props.borderColor) : 8, // Gray/dim
		bg: null,
		attrs: { dim: true },
	};

	// Top indicator (on top border, right side)
	if (ss.hiddenAbove > 0 && border.top > 0) {
		const indicator = `\u25b2${ss.hiddenAbove}`;
		const x = layout.x + layout.width - border.right - indicator.length - 1;
		const y = layout.y;
		renderTextLine(buffer, x, y, indicator, indicatorStyle);
	}

	// Bottom indicator (on bottom border, right side)
	if (ss.hiddenBelow > 0 && border.bottom > 0) {
		const indicator = `\u25bc${ss.hiddenBelow}`;
		const x = layout.x + layout.width - border.right - indicator.length - 1;
		const y = layout.y + layout.height - 1;
		renderTextLine(buffer, x, y, indicator, indicatorStyle);
	}
}

/**
 * Render a Box node.
 */
function renderBox(
	_node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x, y, width, height } = layout;

	// Skip if completely outside clip bounds
	if (clipBounds && (y + height <= clipBounds.top || y >= clipBounds.bottom)) {
		return;
	}

	// Fill background if set
	if (props.backgroundColor) {
		const bg = parseColor(props.backgroundColor);
		// Clip background fill to bounds
		if (clipBounds) {
			const clippedY = Math.max(y, clipBounds.top);
			const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY;
			if (clippedHeight > 0) {
				buffer.fill(x, clippedY, width, clippedHeight, { bg });
			}
		} else {
			buffer.fill(x, y, width, height, { bg });
		}
	}

	// Render border if set
	if (props.borderStyle) {
		renderBorder(buffer, x, y, width, height, props, clipBounds);
	}
}

/**
 * Render a Text node.
 */
function renderText(
	node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: TextProps,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x, width, height } = layout;
	let { y } = layout;

	// Apply scroll offset
	y -= scrollOffset;

	// Clip to bounds if specified
	if (clipBounds) {
		if (y + height <= clipBounds.top || y >= clipBounds.bottom) {
			return; // Completely outside clip bounds
		}
	}

	// Collect text content from this node and all children
	// This handles both raw text nodes and <Text>content</Text> wrapper nodes
	const text = collectTextContent(node);

	// Get style
	const style = getTextStyle(props);

	// Handle wrapping/truncation
	const lines = formatTextLines(text, width, props.wrap);

	// Render each line
	for (let lineIdx = 0; lineIdx < lines.length && lineIdx < height; lineIdx++) {
		const lineY = y + lineIdx;
		// Skip lines outside clip bounds
		if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
			continue;
		}
		const line = lines[lineIdx];
		renderTextLine(buffer, x, lineY, line, style);
	}
}

/**
 * Recursively collect text content from a node and its children.
 * Handles both raw text nodes (textContent set directly) and
 * Text component wrappers (text in children).
 */
function collectTextContent(node: InkxNode): string {
	// If this node has direct text content, return it
	if (node.textContent !== undefined) {
		return node.textContent;
	}

	// Otherwise, collect from children
	let result = '';
	for (const child of node.children) {
		result += collectTextContent(child);
	}
	return result;
}

/**
 * Format text into lines based on wrap mode.
 */
function formatTextLines(text: string, width: number, wrap: TextProps['wrap']): string[] {
	// Guard against width <= 0 to prevent infinite loops
	// This can happen with display="none" nodes (0x0 dimensions)
	if (width <= 0) {
		return [];
	}

	const lines = text.split('\n');

	// No wrapping, just return lines
	if (wrap === false || wrap === 'truncate-end' || wrap === 'truncate') {
		return lines.map((line) => truncateText(line, width, 'end'));
	}

	if (wrap === 'truncate-start') {
		return lines.map((line) => truncateText(line, width, 'start'));
	}

	if (wrap === 'truncate-middle') {
		return lines.map((line) => truncateText(line, width, 'middle'));
	}

	// wrap === true or wrap === 'wrap' - word wrap
	const wrappedLines: string[] = [];
	for (const line of lines) {
		if (getTextWidth(line) <= width) {
			wrappedLines.push(line);
		} else {
			// Simple character wrap (TODO: proper word wrap)
			let remaining = line;
			while (remaining.length > 0) {
				const chunk = sliceByWidth(remaining, width);
				// Guard against infinite loop if sliceByWidth returns empty string
				if (chunk.length === 0) {
					break;
				}
				wrappedLines.push(chunk);
				remaining = remaining.slice(chunk.length);
			}
		}
	}
	return wrappedLines;
}

/**
 * Truncate text to fit within width.
 */
function truncateText(text: string, width: number, mode: 'start' | 'middle' | 'end'): string {
	const textWidth = getTextWidth(text);
	if (textWidth <= width) return text;

	const ellipsis = '\u2026'; // ...
	const availableWidth = width - 1; // Reserve space for ellipsis

	if (availableWidth <= 0) {
		return width > 0 ? ellipsis : '';
	}

	if (mode === 'end') {
		return sliceByWidth(text, availableWidth) + ellipsis;
	}

	if (mode === 'start') {
		return ellipsis + sliceByWidthFromEnd(text, availableWidth);
	}

	// middle
	const halfWidth = Math.floor(availableWidth / 2);
	const startPart = sliceByWidth(text, halfWidth);
	const endPart = sliceByWidthFromEnd(text, availableWidth - halfWidth);
	return startPart + ellipsis + endPart;
}

/**
 * Render a single line of text to the buffer.
 */
function renderTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	// Check if text contains ANSI escape sequences
	if (hasAnsi(text)) {
		renderAnsiTextLine(buffer, x, y, text, baseStyle);
		return;
	}

	// Regular text without ANSI codes
	// Use grapheme segmentation to properly handle:
	// - Emoji (width 2)
	// - Combining characters (width 0, merged with base char)
	// - CJK characters (width 2)
	let col = x;
	const graphemes = splitGraphemes(text);

	for (const grapheme of graphemes) {
		if (col >= buffer.width) break;

		const width = graphemeWidth(grapheme);

		// Skip zero-width graphemes (should be merged by graphemer, but just in case)
		if (width === 0) continue;

		// Preserve existing background color if text style doesn't specify one
		// This allows Text inside Box with backgroundColor to inherit the bg
		const existingBg = baseStyle.bg === null ? buffer.getCell(col, y).bg : baseStyle.bg;

		buffer.setCell(col, y, {
			char: grapheme,
			fg: baseStyle.fg,
			bg: existingBg,
			attrs: baseStyle.attrs,
			wide: width === 2,
			continuation: false,
		});

		if (width === 2 && col + 1 < buffer.width) {
			// Wide character continuation cell
			const existingBg2 = baseStyle.bg === null ? buffer.getCell(col + 1, y).bg : baseStyle.bg;
			buffer.setCell(col + 1, y, {
				char: '',
				fg: baseStyle.fg,
				bg: existingBg2,
				attrs: baseStyle.attrs,
				wide: false,
				continuation: true,
			});
			col += 2;
		} else {
			col += width;
		}
	}
}

/**
 * Background conflict detection mode.
 * Set via INKX_BG_CONFLICT env var: 'ignore' | 'warn' | 'throw'
 * Default: 'throw'
 *
 * - ignore: no detection (for performance or when you know what you're doing)
 * - warn: log warning once per unique conflict (deduplicated)
 * - throw: throw Error immediately (catches programming errors in dev)
 */
type BgConflictMode = 'ignore' | 'warn' | 'throw';

/**
 * Get the current background conflict detection mode.
 * Evaluated at runtime to allow tests to change the env var.
 */
function getBgConflictMode(): BgConflictMode {
	const env = process.env.INKX_BG_CONFLICT?.toLowerCase();
	if (env === 'ignore' || env === 'warn' || env === 'throw') return env;
	return 'throw'; // default - fail fast on programming errors
}

// Track warned conflicts to avoid spam (only used in 'warn' mode)
const warnedBgConflicts = new Set<string>();

/**
 * Render text line with ANSI escape sequences.
 * Parses ANSI codes and applies styles to individual segments.
 */
function renderAnsiTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	const segments = parseAnsiText(text);
	let col = x;

	for (const segment of segments) {
		// Merge segment style with base style
		const style = mergeAnsiStyle(baseStyle, segment);

		// Detect background conflict: chalk.bg* overwrites existing inkx background
		// Check both: 1) Text's own backgroundColor, 2) Parent Box's bg already in buffer
		// Skip if segment has bgOverride flag (explicit opt-out via chalkx.bgOverride)
		const bgConflictMode = getBgConflictMode();
		if (
			bgConflictMode !== 'ignore' &&
			!segment.bgOverride &&
			segment.bg !== undefined &&
			segment.bg !== null
		) {
			// Check if there's an existing background (from Text prop or parent Box fill)
			const existingBufBg = col < buffer.width ? buffer.getCell(col, y).bg : null;
			const hasExistingBg = baseStyle.bg !== null || existingBufBg !== null;

			if (hasExistingBg) {
				const preview = segment.text.slice(0, 30);
				const msg =
					`[inkx] Background conflict: chalk.bg* on text that already has inkx background. ` +
					`Chalk bg will override only text characters, causing visual gaps in padding. ` +
					`Use chalkx.bgOverride() to suppress if intentional. ` +
					`Text: "${preview}${segment.text.length > 30 ? '...' : ''}"`;

				if (bgConflictMode === 'throw') {
					throw new Error(msg);
				}
				// 'warn' mode - deduplicate
				const key = `${existingBufBg}-${segment.bg}-${preview}`;
				if (!warnedBgConflicts.has(key)) {
					warnedBgConflicts.add(key);
					console.warn(msg);
				}
			}
		}

		// Use grapheme segmentation for proper Unicode handling
		const graphemes = splitGraphemes(segment.text);

		for (const grapheme of graphemes) {
			if (col >= buffer.width) break;

			const width = graphemeWidth(grapheme);

			// Skip zero-width graphemes
			if (width === 0) continue;

			// Preserve existing background color if style doesn't specify one
			// This allows Text inside Box with backgroundColor to inherit the bg
			const existingBg = style.bg === null ? buffer.getCell(col, y).bg : style.bg;

			buffer.setCell(col, y, {
				char: grapheme,
				fg: style.fg,
				bg: existingBg,
				attrs: style.attrs,
				wide: width === 2,
				continuation: false,
			});

			if (width === 2 && col + 1 < buffer.width) {
				const existingBg2 = style.bg === null ? buffer.getCell(col + 1, y).bg : style.bg;
				buffer.setCell(col + 1, y, {
					char: '',
					fg: style.fg,
					bg: existingBg2,
					attrs: style.attrs,
					wide: false,
					continuation: true,
				});
				col += 2;
			} else {
				col += width;
			}
		}
	}
}

/**
 * Merge ANSI segment style with base style.
 * ANSI styles override base styles where specified.
 */
function mergeAnsiStyle(base: Style, segment: StyledSegment): Style {
	let fg = base.fg;
	let bg = base.bg;

	// Convert ANSI SGR code to our color format
	if (segment.fg !== undefined && segment.fg !== null) {
		fg = ansiColorToColor(segment.fg, false);
	}
	if (segment.bg !== undefined && segment.bg !== null) {
		bg = ansiColorToColor(segment.bg, true);
	}

	// Merge attributes - start with base, then apply ANSI overrides
	const attrs = {
		...base.attrs,
		bold: segment.bold || base.attrs.bold,
		dim: segment.dim || base.attrs.dim,
		italic: segment.italic || base.attrs.italic,
		underline: segment.underline || base.attrs.underline,
		inverse: segment.inverse || base.attrs.inverse,
	};

	return { fg, bg, attrs };
}

/**
 * Convert ANSI SGR color code to our Color type.
 * Color is: number (256-color index) | { r, g, b } (true color) | null
 */
function ansiColorToColor(code: number, _isBg: boolean): Color {
	// True color (packed RGB with 0x1000000 marker from parseAnsiText)
	if (code >= 0x1000000) {
		const r = (code >> 16) & 0xff;
		const g = (code >> 8) & 0xff;
		const b = code & 0xff;
		return { r, g, b };
	}

	// 256 color palette index (0-255)
	if (code < 30 || (code >= 38 && code < 40) || (code >= 48 && code < 90)) {
		// Direct palette index - map common ones
		const paletteMap: Record<number, number> = {
			0: 0, // black
			1: 1, // red
			2: 2, // green
			3: 3, // yellow
			4: 4, // blue
			5: 5, // magenta
			6: 6, // cyan
			7: 7, // white
			8: 8, // gray
			9: 9, // redBright
			10: 10, // greenBright
			11: 11, // yellowBright
			12: 12, // blueBright
			13: 13, // magentaBright
			14: 14, // cyanBright
			15: 15, // whiteBright
		};
		return paletteMap[code] ?? code;
	}

	// Standard foreground colors (30-37) map to palette 0-7
	if (code >= 30 && code <= 37) {
		return code - 30;
	}

	// Standard background colors (40-47) map to palette 0-7
	if (code >= 40 && code <= 47) {
		return code - 40;
	}

	// Bright foreground colors (90-97) map to palette 8-15
	if (code >= 90 && code <= 97) {
		return code - 90 + 8;
	}

	// Bright background colors (100-107) map to palette 8-15
	if (code >= 100 && code <= 107) {
		return code - 100 + 8;
	}

	return null;
}

/**
 * Render a border around a box.
 */
function renderBorder(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	width: number,
	height: number,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const chars = getBorderChars(props.borderStyle ?? 'single');
	const color = props.borderColor ? parseColor(props.borderColor) : null;

	const showTop = props.borderTop !== false;
	const showBottom = props.borderBottom !== false;
	const showLeft = props.borderLeft !== false;
	const showRight = props.borderRight !== false;

	// Helper to check if a row is visible within clip bounds
	const isRowVisible = (row: number): boolean => {
		if (!clipBounds) return row >= 0 && row < buffer.height;
		return row >= clipBounds.top && row < clipBounds.bottom && row < buffer.height;
	};

	// Top border
	if (showTop && isRowVisible(y)) {
		if (showLeft) buffer.setCell(x, y, { char: chars.topLeft, fg: color });
		for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
			buffer.setCell(col, y, { char: chars.horizontal, fg: color });
		}
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, y, { char: chars.topRight, fg: color });
		}
	}

	// Side borders
	for (let row = y + 1; row < y + height - 1; row++) {
		if (!isRowVisible(row)) continue;
		if (showLeft) buffer.setCell(x, row, { char: chars.vertical, fg: color });
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, row, { char: chars.vertical, fg: color });
		}
	}

	// Bottom border
	const bottomY = y + height - 1;
	if (showBottom && isRowVisible(bottomY)) {
		if (showLeft) {
			buffer.setCell(x, bottomY, { char: chars.bottomLeft, fg: color });
		}
		for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
			buffer.setCell(col, bottomY, { char: chars.horizontal, fg: color });
		}
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, bottomY, {
				char: chars.bottomRight,
				fg: color,
			});
		}
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string): number {
	return displayWidthAnsi(text);
}

/**
 * Slice text by display width (from start).
 * Uses grapheme segmentation for proper Unicode handling.
 */
function sliceByWidth(text: string, maxWidth: number): string {
	let width = 0;
	let result = '';
	const graphemes = splitGraphemes(text);

	for (const grapheme of graphemes) {
		const gWidth = graphemeWidth(grapheme);
		if (width + gWidth > maxWidth) break;
		result += grapheme;
		width += gWidth;
	}

	return result;
}

/**
 * Slice text by display width (from end).
 * Uses grapheme segmentation for proper Unicode handling.
 */
function sliceByWidthFromEnd(text: string, maxWidth: number): string {
	const graphemes = splitGraphemes(text);
	let width = 0;
	let startIdx = graphemes.length;

	for (let i = graphemes.length - 1; i >= 0; i--) {
		const gWidth = graphemeWidth(graphemes[i]);
		if (width + gWidth > maxWidth) break;
		width += gWidth;
		startIdx = i;
	}

	return graphemes.slice(startIdx).join('');
}

/**
 * Get padding values from props.
 */
function getPadding(props: BoxProps): {
	top: number;
	bottom: number;
	left: number;
	right: number;
} {
	return {
		top: props.paddingTop ?? props.paddingY ?? props.padding ?? 0,
		bottom: props.paddingBottom ?? props.paddingY ?? props.padding ?? 0,
		left: props.paddingLeft ?? props.paddingX ?? props.padding ?? 0,
		right: props.paddingRight ?? props.paddingX ?? props.padding ?? 0,
	};
}

/**
 * Get border size (1 or 0 for each side).
 */
function getBorderSize(props: BoxProps): {
	top: number;
	bottom: number;
	left: number;
	right: number;
} {
	if (!props.borderStyle) {
		return { top: 0, bottom: 0, left: 0, right: 0 };
	}
	return {
		top: props.borderTop !== false ? 1 : 0,
		bottom: props.borderBottom !== false ? 1 : 0,
		left: props.borderLeft !== false ? 1 : 0,
		right: props.borderRight !== false ? 1 : 0,
	};
}

/**
 * Get text style from props.
 */
function getTextStyle(props: TextProps): Style {
	return {
		fg: props.color ? parseColor(props.color) : null,
		bg: props.backgroundColor ? parseColor(props.backgroundColor) : null,
		attrs: {
			bold: props.bold,
			dim: props.dim || props.dimColor, // dimColor is Ink compatibility alias
			italic: props.italic,
			underline: props.underline,
			strikethrough: props.strikethrough,
			inverse: props.inverse,
		},
	};
}

/**
 * Parse color string to Color type.
 * Supports: named colors, hex (#rgb, #rrggbb), rgb(r,g,b)
 */
function parseColor(color: string): Color {
	// Named colors map to 256-color indices
	const namedColors: Record<string, number> = {
		black: 0,
		red: 1,
		green: 2,
		yellow: 3,
		blue: 4,
		magenta: 5,
		cyan: 6,
		white: 7,
		gray: 8,
		grey: 8,
		blackBright: 8,
		redBright: 9,
		greenBright: 10,
		yellowBright: 11,
		blueBright: 12,
		magentaBright: 13,
		cyanBright: 14,
		whiteBright: 15,
	};

	if (color in namedColors) {
		return namedColors[color];
	}

	// Hex color
	if (color.startsWith('#')) {
		const hex = color.slice(1);
		if (hex.length === 3) {
			const r = Number.parseInt(hex[0] + hex[0], 16);
			const g = Number.parseInt(hex[1] + hex[1], 16);
			const b = Number.parseInt(hex[2] + hex[2], 16);
			return { r, g, b };
		}
		if (hex.length === 6) {
			const r = Number.parseInt(hex.slice(0, 2), 16);
			const g = Number.parseInt(hex.slice(2, 4), 16);
			const b = Number.parseInt(hex.slice(4, 6), 16);
			return { r, g, b };
		}
	}

	// rgb(r,g,b)
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}

	return null;
}

/**
 * Get border characters for a style.
 */
function getBorderChars(style: BoxProps['borderStyle']): BorderChars {
	const borders: Record<NonNullable<BoxProps['borderStyle']>, BorderChars> = {
		single: {
			topLeft: '\u250c',
			topRight: '\u2510',
			bottomLeft: '\u2514',
			bottomRight: '\u2518',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		double: {
			topLeft: '\u2554',
			topRight: '\u2557',
			bottomLeft: '\u255a',
			bottomRight: '\u255d',
			horizontal: '\u2550',
			vertical: '\u2551',
		},
		round: {
			topLeft: '\u256d',
			topRight: '\u256e',
			bottomLeft: '\u2570',
			bottomRight: '\u256f',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		bold: {
			topLeft: '\u250f',
			topRight: '\u2513',
			bottomLeft: '\u2517',
			bottomRight: '\u251b',
			horizontal: '\u2501',
			vertical: '\u2503',
		},
		singleDouble: {
			topLeft: '\u2553',
			topRight: '\u2556',
			bottomLeft: '\u2559',
			bottomRight: '\u255c',
			horizontal: '\u2500',
			vertical: '\u2551',
		},
		doubleSingle: {
			topLeft: '\u2552',
			topRight: '\u2555',
			bottomLeft: '\u2558',
			bottomRight: '\u255b',
			horizontal: '\u2550',
			vertical: '\u2502',
		},
		classic: {
			topLeft: '+',
			topRight: '+',
			bottomLeft: '+',
			bottomRight: '+',
			horizontal: '-',
			vertical: '|',
		},
	};

	return borders[style ?? 'single'];
}
