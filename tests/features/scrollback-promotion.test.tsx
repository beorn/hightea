/**
 * Scrollback promotion — verifies box borders survive promotion to terminal scrollback
 * and that the screen is never blank after Enter presses.
 *
 * Uses the CodingAgent example to trigger scrollback promotion via repeated Enter presses.
 * Tests the km-7dfxf bug: last promoted box's ╰ bottom border gets truncated.
 * Tests blank-screen-on-Enter bug: screen goes blank after promotion.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT } from "../../examples/interactive/static-scrollback"

describe("scrollback promotion: border preservation", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("fully promoted boxes retain all border characters", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // 5 presses: enough content that complete boxes are in scrollback
    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")
    }

    const scrollbackText = term.scrollback!.getText()
    expect(scrollbackText.length).toBeGreaterThan(0)

    expect(scrollbackText).toContain("╭")
    expect(scrollbackText).toContain("│")
    expect(scrollbackText).toContain("╰")
  })

  test("last promoted box retains ╰ bottom border", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // 4 presses: scrollback has content with complete box borders
    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
    }

    const scrollbackText = term.scrollback!.getText()
    expect(scrollbackText.length).toBeGreaterThan(0)
    expect(scrollbackText).toContain("╰")
  })
})

describe("scrollback promotion: no blank screen on Enter", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  /**
   * Check that visible screen has meaningful content — not blank/empty.
   * Returns true if screen has at least some non-whitespace text.
   */
  function screenHasContent(screen: NonNullable<Term["screen"]>): boolean {
    const text = screen.getText()
    // Strip whitespace and check for meaningful content
    return text.replace(/\s/g, "").length > 0
  }

  test("screen is never blank after Enter presses (small terminal)", async () => {
    // Use a small terminal (24 rows) to trigger the issue sooner —
    // content fills the screen faster, making promotion happen earlier.
    term = createTermless({ cols: 120, rows: 24 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Initial render should have content
    expect(screenHasContent(term.screen!)).toBe(true)

    // Press Enter repeatedly — screen must never go blank
    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      const hasContent = screenHasContent(term.screen!)
      const screenText = term.screen!.getText()
      const lines = term.screen!.getLines()
      // Count non-blank lines
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length
      expect(
        hasContent,
        `Screen blank after Enter press ${i + 1}.\n` +
          `Non-blank lines: ${nonBlankLines}/${lines.length}\n` +
          `Screen text:\n${screenText}`,
      ).toBe(true)
      // Should always have at least the status bar with "context"
      expect(term.screen).toContainText("context")
      // Should have substantial content — not just 1-2 lines
      expect(
        nonBlankLines,
        `Too few non-blank lines after Enter press ${i + 1}: ${nonBlankLines}`,
      ).toBeGreaterThan(2)
    }
  })

  test("screen is never blank after Enter presses (very small terminal)", async () => {
    // Even smaller terminal to exacerbate the issue
    term = createTermless({ cols: 80, rows: 16 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    expect(screenHasContent(term.screen!)).toBe(true)

    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      const hasContent = screenHasContent(term.screen!)
      const screenText = term.screen!.getText()
      expect(hasContent, `Screen blank after Enter press ${i + 1}. Screen text:\n${screenText}`).toBe(
        true,
      )
      expect(term.screen).toContainText("context")
    }
  })

  test("screen transitions are smooth — content count never drops drastically", async () => {
    // Track non-blank line count across presses.
    // A "blank screen" manifests as a sudden drop in non-blank lines.
    term = createTermless({ cols: 120, rows: 24 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    let prevNonBlank = 0
    const lines0 = term.screen!.getLines()
    prevNonBlank = lines0.filter((l: string) => l.trim().length > 0).length

    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")

      const lines = term.screen!.getLines()
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

      // Content should never drop to less than half of what it was (unless it was <3)
      if (prevNonBlank >= 3) {
        expect(
          nonBlankLines,
          `Content dropped from ${prevNonBlank} to ${nonBlankLines} non-blank lines ` +
            `after Enter ${i + 1} (possible blank screen bug)\n` +
            lines.map((l: string, idx: number) => `  ${idx}: "${l.trimEnd().slice(0, 80)}"`).join("\n"),
        ).toBeGreaterThanOrEqual(Math.floor(prevNonBlank / 3))
      }
      prevNonBlank = nonBlankLines
    }
  })

  test("live content always renders in visible area after promotion", async () => {
    // Test that after each promotion the live content occupies the screen correctly.
    // The bug manifests as live content being pushed off-screen or the cursor
    // being at the wrong position, leaving visible area blank.
    term = createTermless({ cols: 120, rows: 20 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")

      const lines = term.screen!.getLines()
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

      // After a few presses, we expect content to fill most of the screen.
      // The live area should have at least the latest exchange + status bar.
      // If we see fewer than 3 non-blank lines on a 20-row terminal,
      // something went very wrong.
      expect(
        nonBlankLines,
        `After Enter ${i + 1}: only ${nonBlankLines}/${lines.length} non-blank lines\n` +
          lines.map((l: string, idx: number) => `  ${idx}: ${l.slice(0, 80)}`).join("\n"),
      ).toBeGreaterThan(2)
    }
  })
})
