/**
 * Regression tests for ai-chat (static-scrollback) showcase bugs.
 *
 * Bug 1: Input box jumps up — header should hide before items freeze, not during
 * Bug 2: Ctrl-D exit — after first Ctrl-D, show "press Ctrl-D again to exit"
 * Bug 3: Unintuitive advancement — only timers and user text submission advance
 * Bug 4: Turn box (Agent section) bottom border cropped
 * Bug 5: Status bar "scrollbackcontext" concatenation
 *
 * Uses createTermless for full ANSI rendering verification.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT, type ScriptEntry } from "../../examples/interactive/static-scrollback"

// ============================================================================
// Short script for testing — structured to test advancement behavior
// ============================================================================

const SHORT_SCRIPT: ScriptEntry[] = [
  { role: "user", content: "Fix the bug", tokens: { input: 50, output: 0 } },
  {
    role: "agent",
    content: "Looking at the code.",
    toolCalls: [{ tool: "Read", args: "src/foo.ts", output: ["line 1", "line 2"] }],
    tokens: { input: 200, output: 100 },
  },
  {
    role: "agent",
    content: "Fixed it.",
    tokens: { input: 300, output: 50 },
  },
  { role: "user", content: "Thanks", tokens: { input: 60, output: 0 } },
  {
    role: "agent",
    content: "All done!",
    tokens: { input: 400, output: 30 },
  },
]

/** Wait for renders to settle. */
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// ============================================================================
// Bug 1: Input box jump — header should not cause layout shift during freeze
// ============================================================================

describe("bug 1: input box position stability", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("header hides when first exchange appears (before any freeze)", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // After mount + auto-advance, the first exchange should be visible
    // and the header should already be hidden (exchanges.length > 0)
    await settle()

    const text = term.screen!.getText()
    // The header text "Static Scrollback" should NOT be visible
    // since exchanges exist after the initial advance
    expect(text).not.toContain("Static Scrollback")
    // First exchange should be visible
    expect(text).toContain("Fix the bug")
  })

  test("header is shown only before any exchanges exist", async () => {
    term = createTermless({ cols: 120, rows: 40 })

    // CodingAgent auto-advances on mount, so the header disappears immediately
    // once the first exchange is added. This is the desired behavior:
    // header hides when exchanges appear, NOT when items freeze.
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle()

    // Header should be gone, first exchange visible
    const text = term.screen!.getText()
    expect(text).not.toContain("ScrollbackList")
    expect(text).toContain("Fix the bug")
  })

  test("header does not reappear after being hidden", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle()

    // After initial advance, header should be hidden
    expect(term.screen!.getText()).not.toContain("Static Scrollback")

    // Advance several times — header should never reappear
    for (let i = 0; i < 5; i++) {
      await handle.press("o")
      await handle.press("k")
      await handle.press("Enter")
      await settle(500)

      const text = term.screen!.getText()
      expect(text).not.toContain("Static Scrollback")
      expect(text).not.toContain("ScrollbackList")
    }
  })
})

// ============================================================================
// Bug 2: Ctrl-D exit feedback
// ============================================================================

describe("bug 2: ctrl-d exit feedback", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("first ctrl-d shows exit hint in placeholder", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle()

    // First Ctrl-D — should show exit hint
    await handle.press("ctrl+d")
    await settle(50)

    const text = term.screen!.getText()
    expect(text).toMatch(/ctrl.d.*exit/i)
  })

  test("double ctrl-d exits the app", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle()

    await handle.press("ctrl+d")
    await handle.press("ctrl+d")

    const exitRace = await Promise.race([
      handle.waitUntilExit().then(() => "exited"),
      new Promise((r) => setTimeout(() => r("timeout"), 500)),
    ])
    expect(exitRace).toBe("exited")
  })

  test("exit hint clears on next non-ctrl-d keypress", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle()

    // First Ctrl-D — show hint
    await handle.press("ctrl+d")
    await settle(50)
    expect(term.screen!.getText()).toMatch(/ctrl.d.*exit/i)

    // Any other key — hint should clear
    await handle.press("a")
    await settle(50)
    const afterText = term.screen!.getText()
    expect(afterText).not.toMatch(/ctrl.d.*exit/i)
  })
})

// ============================================================================
// Bug 3: Unintuitive advancement
// ============================================================================

describe("bug 3: unintuitive advancement", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("agent turns auto-advance until next user turn", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to chain through agent entries
    await settle(1500)

    const text = term.screen!.getText()
    // Mount advances user[0] -> auto-chains agent[1] -> agent[2] -> stops at user[3]
    expect(text).toContain("Fix the bug")
    expect(text).toContain("Looking at the code")
    expect(text).toContain("Fixed it")
  })

  test("empty Enter does NOT advance the script", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    // Get screen state before — should show entries up to "Fixed it."
    const before = term.screen!.getText()
    expect(before).toContain("Fixed it")

    // Clear pre-filled text by pressing Ctrl-U, then press Enter with empty input
    await handle.press("ctrl+u")
    await handle.press("Enter")
    await settle()

    // Should NOT have advanced — "All done!" should NOT appear
    const after = term.screen!.getText()
    expect(after).not.toContain("All done!")
  })

  test("submitting typed text adds user message to exchanges", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    // At user turn -- "Fixed it." should be visible from agent chain
    expect(term.screen!.getText()).toContain("Fixed it")

    // Type text and submit -- the user's typed message should appear
    await handle.press("ctrl+u")
    await handle.press("o")
    await handle.press("k")
    await handle.press("Enter")
    await settle(100)

    // The user message "ok" should appear on screen as a visible exchange
    const text = term.screen!.getText()
    expect(text).toContain("ok")
  })

  test("right-arrow does not advance script", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    // At user turn, should show "Fixed it" from agent
    const before = term.screen!.getText()
    expect(before).toContain("Fixed it")

    // Press right-arrow — should NOT advance
    await handle.press("Right")
    await settle()

    const after = term.screen!.getText()
    expect(after).not.toContain("All done!")
  })

  test("ctrl-d does not advance script", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    const before = term.screen!.getText()
    expect(before).toContain("Fixed it")

    // Single Ctrl-D should NOT advance (just sets exit hint)
    await handle.press("ctrl+d")
    await settle()

    const after = term.screen!.getText()
    expect(after).not.toContain("All done!")
  })
})

// ============================================================================
// Bug 4: Turn box bottom border
// ============================================================================

describe("bug 4: agent turn box bottom border", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("agent box has complete border (top and bottom)", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(300)

    const lines = term.screen!.getLines()

    // Count round border characters
    let topBorderCount = 0
    let bottomBorderCount = 0
    for (const line of lines) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith("\u256D")) topBorderCount++
      if (trimmed.startsWith("\u2570")) bottomBorderCount++
    }

    // Every box with a top border should have a matching bottom border
    expect(bottomBorderCount).toBeGreaterThanOrEqual(topBorderCount)
  })

  test("agent box bottom border is not cropped by terminal height", async () => {
    // Use a smaller terminal to force content near the bottom
    term = createTermless({ cols: 100, rows: 25 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    const lines = term.screen!.getLines()

    // Find the LAST top border and last bottom border
    let lastTopRow = -1
    let lastBottomRow = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trimStart()
      if (trimmed.startsWith("\u256D")) lastTopRow = i
      if (trimmed.startsWith("\u2570")) lastBottomRow = i
    }

    // If there's a top border visible, the matching bottom border should also be visible
    if (lastTopRow >= 0) {
      expect(lastBottomRow).toBeGreaterThan(lastTopRow)
    }
  })

  test("visible agent boxes always have matching top and bottom borders", async () => {
    term = createTermless({ cols: 100, rows: 30 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(300)

    const lines = term.screen!.getLines()
    const allText = lines.join("\n")

    // Count all round border characters in the visible screen
    const topBorders = (allText.match(/\u256D/g) || []).length
    const bottomBorders = (allText.match(/\u2570/g) || []).length

    // Must have equal or more bottom borders than top borders
    expect(bottomBorders).toBeGreaterThanOrEqual(topBorders)
  })
})

// ============================================================================
// Bug 5: Status bar text — no "scrollbackcontext" concatenation
// ============================================================================

describe("bug 5: status bar text", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("scrollbackcontext never appears as concatenated text", async () => {
    term = createTermless({ cols: 120, rows: 30 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance several times to trigger frozen items
    for (let i = 0; i < 4; i++) {
      await handle.press("o")
      await handle.press("k")
      await handle.press("Enter")
      await settle(500)
    }

    const text = term.screen!.getText()
    // "scrollbackcontext" should NEVER appear as a single word
    expect(text).not.toContain("scrollbackcontext")
    // "scrollbackctx" should also not appear
    expect(text).not.toContain("scrollbackctx")
  })

  test("status bar uses visual separator between scrollback count and context bar", async () => {
    term = createTermless({ cols: 120, rows: 30 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance to trigger frozen items
    for (let i = 0; i < 4; i++) {
      await handle.press("o")
      await handle.press("k")
      await handle.press("Enter")
      await settle(500)
    }

    const lines = term.screen!.getLines()
    // Find the status bar line (last line, has "ctx" and cost info)
    const statusLine = lines.find((l) => l.includes("ctx") && (l.includes("%") || l.includes("$")))

    if (statusLine) {
      // If "in scrollback" appears, it should be separated from "ctx" by a separator
      if (statusLine.includes("in scrollback")) {
        // Should have a visual separator between scrollback info and context bar
        expect(statusLine).toMatch(/scrollback.*\u2502.*ctx/)
      }
    }
  })

  test("status bar with frozen items at narrow width", async () => {
    term = createTermless({ cols: 80, rows: 25 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance to trigger frozen items
    for (let i = 0; i < 6; i++) {
      await handle.press("o")
      await handle.press("k")
      await handle.press("Enter")
      await settle(400)
    }

    const text = term.screen!.getText()
    // Even at narrow widths, these words should never concatenate
    expect(text).not.toContain("scrollbackcontext")
    expect(text).not.toContain("scrollbackctx")
  })
})
