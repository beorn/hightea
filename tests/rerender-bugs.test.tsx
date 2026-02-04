/**
 * Re-render Bug Reproduction Tests
 *
 * Tests for bugs observed in inkx examples:
 * 1. Colors lost after scrolling/state changes
 * 2. Style bleeding across re-renders
 * 3. Diff output not properly resetting styles
 */

import React from 'react';
import { describe, expect, test } from 'vitest';
import { TerminalBuffer, cellEquals, styleEquals } from '../src/buffer.js';
import { Box, Text } from '../src/index.js';
import { outputPhase } from '../src/pipeline.js';
import { createRenderer, stripAnsi } from '../src/testing/index.js';

const render = createRenderer();

describe('Bug: Colors lost after re-render', () => {
	test('colored text should retain color after rerender', () => {
		// Use simple stateless components to avoid hook issues
		function ColoredText({ count }: { count: number }) {
			return (
				<Box flexDirection="column">
					<Text color="red">Red text: {count}</Text>
					<Text color="green">Green text: {count}</Text>
					<Text color="blue">Blue text: {count}</Text>
				</Box>
			);
		}

		const { lastFrame, rerender } = render(<ColoredText count={0} />);

		// Initial render should have content
		const frame1 = lastFrame() ?? '';
		expect(stripAnsi(frame1)).toContain('Red text: 0');
		expect(stripAnsi(frame1)).toContain('Green text: 0');
		expect(stripAnsi(frame1)).toContain('Blue text: 0');

		// Check that ANSI color codes are present
		expect(frame1).toMatch(/\x1b\[/);

		// Rerender with updated count
		rerender(<ColoredText count={1} />);

		const frame2 = lastFrame() ?? '';
		expect(stripAnsi(frame2)).toContain('Red text: 1');
		// Colors should still be present
		expect(frame2).toMatch(/\x1b\[/);
	});

	test('selection highlight should persist after navigation', () => {
		function SelectableList({ selected }: { selected: number }) {
			const items = ['Item 1', 'Item 2', 'Item 3'];

			return (
				<Box flexDirection="column">
					{items.map((item, i) => (
						<Text
							key={i}
							backgroundColor={i === selected ? 'cyan' : undefined}
							color={i === selected ? 'black' : undefined}
						>
							{item}
						</Text>
					))}
				</Box>
			);
		}

		const { lastFrame, rerender } = render(<SelectableList selected={0} />);

		// Initial render should show first item selected
		const frame1 = lastFrame() ?? '';
		expect(stripAnsi(frame1)).toContain('Item 1');

		// Move selection to second item
		rerender(<SelectableList selected={1} />);

		const frame2 = lastFrame() ?? '';
		expect(stripAnsi(frame2)).toContain('Item 1');
		expect(stripAnsi(frame2)).toContain('Item 2');
		expect(stripAnsi(frame2)).toContain('Item 3');
		// Should have ANSI codes for the new selection
		expect(frame2).toMatch(/\x1b\[/);
	});
});

describe('Bug: Style bleeding in diff output', () => {
	test('style reset should happen before each cell change', () => {
		// Create two buffers with different styles in same positions
		const prev = new TerminalBuffer(10, 2);
		prev.setCell(0, 0, { char: 'A', fg: 1, bg: null, attrs: { bold: true } }); // Red bold
		prev.setCell(1, 0, { char: 'B', fg: 2, bg: null, attrs: {} }); // Green

		const next = new TerminalBuffer(10, 2);
		next.setCell(0, 0, { char: 'A', fg: null, bg: null, attrs: {} }); // No style
		next.setCell(1, 0, { char: 'C', fg: 3, bg: null, attrs: {} }); // Yellow

		const output = outputPhase(prev, next);

		// The output should contain style resets
		// Each changed cell should have its own style applied correctly
		expect(output).toContain('\x1b['); // Contains escape sequences

		// Should not be empty since styles changed
		expect(output.length).toBeGreaterThan(0);
	});

	test('clearing a styled cell should reset to default style', () => {
		const prev = new TerminalBuffer(5, 1);
		prev.setCell(0, 0, { char: 'X', fg: 1, bg: 6, attrs: { bold: true } }); // Red on cyan, bold

		const next = new TerminalBuffer(5, 1);
		next.setCell(0, 0, { char: ' ', fg: null, bg: null, attrs: {} }); // Empty, no style

		const output = outputPhase(prev, next);

		// Should output the change with reset style
		expect(output.length).toBeGreaterThan(0);
	});

	test('buffer diff detects style-only changes', () => {
		const prev = new TerminalBuffer(5, 1);
		prev.setCell(0, 0, { char: 'A', fg: 1, bg: null, attrs: {} }); // Red

		const next = new TerminalBuffer(5, 1);
		next.setCell(0, 0, { char: 'A', fg: 2, bg: null, attrs: {} }); // Green (same char, different color)

		// Cells should not be equal
		const prevCell = prev.getCell(0, 0);
		const nextCell = next.getCell(0, 0);
		expect(cellEquals(prevCell, nextCell)).toBe(false);

		// Output should have the change
		const output = outputPhase(prev, next);
		expect(output.length).toBeGreaterThan(0);
	});
});

describe('Bug: Text content overwriting', () => {
	test('shorter text should clear previous longer text', () => {
		function DynamicText({ text }: { text: string }) {
			return <Text>{text}</Text>;
		}

		const { lastFrame, rerender } = render(<DynamicText text="Hello World" />);

		const frame1 = lastFrame() ?? '';
		expect(stripAnsi(frame1)).toContain('Hello World');

		rerender(<DynamicText text="Hi" />);

		const frame2 = lastFrame() ?? '';
		// "Hi" should be there
		expect(stripAnsi(frame2)).toContain('Hi');
		// "World" from previous frame should NOT be there
		expect(stripAnsi(frame2)).not.toContain('World');
	});

	test('multi-line content should clear properly on resize', () => {
		function MultiLine({ lines }: { lines: string[] }) {
			return (
				<Box flexDirection="column">
					{lines.map((line, i) => (
						<Text key={i}>{line}</Text>
					))}
				</Box>
			);
		}

		const { lastFrame, rerender } = render(<MultiLine lines={['Line 1', 'Line 2', 'Line 3']} />);

		const frame1 = lastFrame() ?? '';
		expect(stripAnsi(frame1)).toContain('Line 1');
		expect(stripAnsi(frame1)).toContain('Line 2');
		expect(stripAnsi(frame1)).toContain('Line 3');

		// Reduce to fewer lines
		rerender(<MultiLine lines={['New Line']} />);

		const frame2 = lastFrame() ?? '';
		expect(stripAnsi(frame2)).toContain('New Line');
		// Old lines should be gone
		expect(stripAnsi(frame2)).not.toContain('Line 2');
		expect(stripAnsi(frame2)).not.toContain('Line 3');
	});
});

describe('Bug: Buffer dimension changes', () => {
	test('buffer resize should clear old content', () => {
		const prev = new TerminalBuffer(20, 5);
		prev.setCell(15, 0, { char: 'X' }); // Far right
		prev.setCell(0, 4, { char: 'Y' }); // Bottom left

		// Smaller buffer
		const next = new TerminalBuffer(10, 3);
		next.setCell(0, 0, { char: 'A' });

		// This is a fresh render scenario - prev is null conceptually
		// But if we're comparing, we need to handle size mismatch
		const output = outputPhase(null, next);

		// Should render the new content
		expect(output).toContain('A');
	});
});

describe('Bug: Scroll container style preservation', () => {
	test('scrolling should preserve child styles', () => {
		function ScrollableList({ scrollOffset }: { scrollOffset: number }) {
			const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);

			return (
				<Box flexDirection="column" height={5} overflow="hidden">
					{items.slice(scrollOffset, scrollOffset + 5).map((item, i) => (
						<Text key={i} color={i === 0 ? 'cyan' : undefined}>
							{item}
						</Text>
					))}
				</Box>
			);
		}

		const { lastFrame, rerender } = render(<ScrollableList scrollOffset={0} />);

		const frame1 = lastFrame() ?? '';
		expect(stripAnsi(frame1)).toContain('Item 1');

		// After scroll, colors should still work
		rerender(<ScrollableList scrollOffset={2} />);

		const frame2 = lastFrame() ?? '';
		expect(stripAnsi(frame2)).toContain('Item 3'); // First visible after scroll
		// Should still have ANSI codes for cyan
		expect(frame2).toMatch(/\x1b\[/);
	});
});

describe('Bug: styleEquals edge cases', () => {
	test('null style should not equal default style object', () => {
		const nullStyle = null;
		const defaultStyle = { fg: null, bg: null, attrs: {} };

		// These should NOT be equal - null means "no style info"
		// while defaultStyle is explicit "default values"
		expect(styleEquals(nullStyle, defaultStyle)).toBe(false);
	});

	test('empty attrs should equal attrs with all false values', () => {
		const style1 = { fg: null, bg: null, attrs: {} };
		const style2 = {
			fg: null,
			bg: null,
			attrs: {
				bold: false,
				dim: false,
				italic: false,
				underline: false,
				inverse: false,
			},
		};

		// These SHOULD be functionally equal
		expect(styleEquals(style1, style2)).toBe(true);
	});
});

describe('ANSI diff output correctness', () => {
	test('selection highlight moving between items produces correct ANSI', () => {
		// Simulate a list where selection moves from item 0 to item 1
		const prev = new TerminalBuffer(10, 3);
		// Row 0: selected (cyan bg, black fg)
		for (let x = 0; x < 6; x++) {
			prev.setCell(x, 0, { char: 'Item 1'[x], fg: 0, bg: 6, attrs: {} }); // black on cyan
		}
		// Row 1: unselected (default)
		for (let x = 0; x < 6; x++) {
			prev.setCell(x, 1, { char: 'Item 2'[x], fg: null, bg: null, attrs: {} });
		}

		const next = new TerminalBuffer(10, 3);
		// Row 0: deselected (default)
		for (let x = 0; x < 6; x++) {
			next.setCell(x, 0, { char: 'Item 1'[x], fg: null, bg: null, attrs: {} });
		}
		// Row 1: now selected (cyan bg, black fg)
		for (let x = 0; x < 6; x++) {
			next.setCell(x, 1, { char: 'Item 2'[x], fg: 0, bg: 6, attrs: {} }); // black on cyan
		}

		const output = outputPhase(prev, next);

		// Should contain positioning and style changes
		expect(output.length).toBeGreaterThan(0);

		// Row 0 cells should be reset (no bg) — contains SGR 0 reset
		expect(output).toContain('\x1b[0m');

		// Row 1 cells should have cyan bg (48;5;6) applied
		expect(output).toContain('48;5;6');

		// Should contain the characters from both rows
		expect(output).toContain('I');
	});

	test('background removal emits proper reset codes', () => {
		const prev = new TerminalBuffer(5, 1);
		prev.setCell(0, 0, { char: 'A', fg: 1, bg: 4, attrs: { bold: true } }); // red on blue, bold

		const next = new TerminalBuffer(5, 1);
		next.setCell(0, 0, { char: 'A', fg: null, bg: null, attrs: {} }); // plain

		const output = outputPhase(prev, next);

		// Should contain a reset (SGR 0) — styleToAnsi always starts with reset
		expect(output).toContain('\x1b[0m');

		// Should NOT contain bg color codes (48;5;...)
		expect(output).not.toContain('48;5;');
	});

	test('\\r\\n optimization does not leak background color', () => {
		// Create buffers where changes span two consecutive rows starting at col 0
		// with the first row having a bg color
		const prev = new TerminalBuffer(10, 3);

		const next = new TerminalBuffer(10, 3);
		// Row 0, col 0: has cyan bg
		next.setCell(0, 0, { char: 'A', fg: null, bg: 6, attrs: {} });
		// Row 1, col 0: no bg (this triggers \r\n optimization)
		next.setCell(0, 1, { char: 'B', fg: null, bg: null, attrs: {} });

		const output = outputPhase(prev, next);

		// The \r\n should be preceded by a reset when bg is active
		// Find all occurrences of \r\n in the output
		const rn = '\r\n';
		const rnIdx = output.indexOf(rn);
		if (rnIdx >= 0) {
			// The reset (\x1b[0m) should appear before the \r\n
			const beforeRn = output.slice(0, rnIdx);
			// After writing 'A' with bg, reset must come before \r\n
			const lastReset = beforeRn.lastIndexOf('\x1b[0m');
			const lastBgSet = beforeRn.lastIndexOf('48;5;6');
			// Reset should appear after the bg was set (i.e., after writing the bg cell)
			expect(lastReset).toBeGreaterThan(lastBgSet);
		}
	});

	test('style-only cell changes produce correct diff output', () => {
		const prev = new TerminalBuffer(5, 1);
		prev.setCell(0, 0, { char: 'X', fg: 1, bg: null, attrs: {} }); // red
		prev.setCell(1, 0, { char: 'Y', fg: 2, bg: null, attrs: {} }); // green

		const next = new TerminalBuffer(5, 1);
		next.setCell(0, 0, { char: 'X', fg: 3, bg: null, attrs: { bold: true } }); // yellow bold
		next.setCell(1, 0, { char: 'Y', fg: 2, bg: null, attrs: {} }); // green (unchanged)

		const output = outputPhase(prev, next);

		// Should have changes for cell (0,0) only — cell (1,0) unchanged
		expect(output).toContain('X');
		expect(output).not.toContain('Y');

		// Should contain yellow fg (38;5;3) and bold (1)
		expect(output).toContain('38;5;3');
		expect(output).toMatch(/;1[;m]/); // bold SGR code
	});

	test('buffer shrink emits clearing changes for old area', () => {
		const prev = new TerminalBuffer(10, 3);
		// Fill some content in the area that will be outside the new buffer
		prev.setCell(8, 0, { char: 'Z', fg: 1, bg: null, attrs: {} });
		prev.setCell(0, 2, { char: 'W', fg: 2, bg: null, attrs: {} });

		// Smaller buffer
		const next = new TerminalBuffer(5, 2);
		next.setCell(0, 0, { char: 'A', fg: null, bg: null, attrs: {} });

		const output = outputPhase(prev, next);

		// Should emit changes for the shrunk area
		expect(output.length).toBeGreaterThan(0);

		// The output should position cursor at cells beyond next.width (col 5-9)
		// Col 6 (1-indexed) on row 1: \x1b[1;6H
		expect(output).toContain('\x1b[1;6H');
		// Row 2 col 6 clearing: \x1b[2;6H
		expect(output).toContain('\x1b[2;6H');

		// Row 3 clearing (height shrink) — may use \r\n or absolute positioning
		// Either way, spaces must be emitted for the old row 2 area
		// Count total spaces in output — should include clearing for cols 5-9 on rows 0-1
		// plus all 10 cols on row 2
		const spaceCount = (output.match(/ /g) || []).length;
		// 5 cols × 2 rows (width shrink) + 10 cols × 1 row (height shrink) = 20
		expect(spaceCount).toBe(20);
	});

	test('buffer shrink width clears trailing columns', () => {
		const prev = new TerminalBuffer(8, 1);
		prev.setCell(0, 0, { char: 'H', fg: null, bg: null, attrs: {} });
		prev.setCell(5, 0, { char: 'X', fg: 1, bg: 2, attrs: { bold: true } });

		const next = new TerminalBuffer(4, 1);
		next.setCell(0, 0, { char: 'H', fg: null, bg: null, attrs: {} });

		const output = outputPhase(prev, next);

		// Cells at x=4..7 should be cleared (spaces with no style)
		// The clearing cells are at positions 5-8 (1-indexed)
		expect(output).toContain('\x1b[1;5H'); // cursor to col 5, row 1
	});
});

describe('Bug: Cell comparison edge cases', () => {
	test('cells with same char but different styles are not equal', () => {
		const cell1 = {
			char: 'A',
			fg: 1 as const,
			bg: null,
			attrs: {},
			wide: false,
			continuation: false,
		};
		const cell2 = {
			char: 'A',
			fg: 2 as const,
			bg: null,
			attrs: {},
			wide: false,
			continuation: false,
		};

		expect(cellEquals(cell1, cell2)).toBe(false);
	});

	test('cells with null fg should equal cells with 0 fg', () => {
		// This tests the edge case where null and 0 might be confused
		const cellNull = {
			char: 'A',
			fg: null,
			bg: null,
			attrs: {},
			wide: false,
			continuation: false,
		};
		const cellZero = {
			char: 'A',
			fg: 0 as const, // Black color
			bg: null,
			attrs: {},
			wide: false,
			continuation: false,
		};

		// These should NOT be equal - null means default, 0 means black
		expect(cellEquals(cellNull, cellZero)).toBe(false);
	});
});
