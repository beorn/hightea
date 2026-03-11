/**
 * Scrollback promotion — verifies box borders survive promotion to terminal scrollback.
 *
 * Uses the CodingAgent example to trigger scrollback promotion via repeated Enter presses.
 * Tests the km-7dfxf bug: last promoted box's ╰ bottom border gets truncated.
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

  // Known bug km-7dfxf: the LAST promoted box's bottom border (╰) gets truncated.
  // At 4 presses, the scrollback contains ╭ and │ but not ╰ for the boundary box.
  test.fails("last promoted box retains ╰ bottom border", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // 4 presses: scrollback starts to have content but last box is cut off
    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
    }

    const scrollbackText = term.scrollback!.getText()
    expect(scrollbackText.length).toBeGreaterThan(0)
    expect(scrollbackText).toContain("╰")
  })
})
