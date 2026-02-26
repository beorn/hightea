/**
 * DECRQM Mode Query Tests
 */

import { describe, expect, test } from "vitest"
import { queryMode, queryModes, DecMode } from "../src/mode-query.js"

/** Capture all writes to a string */
function createCapture(): { write: (data: string) => void; output: () => string } {
  const chunks: string[] = []
  return {
    write: (data: string) => chunks.push(data),
    output: () => chunks.join(""),
  }
}

function mockRead(response: string | null, delayMs = 0): (ms: number) => Promise<string | null> {
  return (_timeoutMs: number) =>
    new Promise((resolve) => {
      if (response == null) {
        setTimeout(() => resolve(null), delayMs || _timeoutMs)
      } else {
        setTimeout(() => resolve(response), delayMs)
      }
    })
}

// ============================================================================
// queryMode
// ============================================================================

describe("queryMode", () => {
  test("sends correct DECRQM query for alt screen", async () => {
    const cap = createCapture()
    await queryMode(cap.write, mockRead(null), DecMode.ALT_SCREEN, 10)
    expect(cap.output()).toBe("\x1b[?1049$p")
  })

  test("sends correct DECRQM query for bracketed paste", async () => {
    const cap = createCapture()
    await queryMode(cap.write, mockRead(null), DecMode.BRACKETED_PASTE, 10)
    expect(cap.output()).toBe("\x1b[?2004$p")
  })

  test("returns 'set' for Ps=1", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?1049;1$y"),
      DecMode.ALT_SCREEN,
    )
    expect(result).toBe("set")
  })

  test("returns 'reset' for Ps=2", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?1049;2$y"),
      DecMode.ALT_SCREEN,
    )
    expect(result).toBe("reset")
  })

  test("returns 'unknown' for Ps=0 (not recognized)", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?9999;0$y"),
      9999,
    )
    expect(result).toBe("unknown")
  })

  test("returns 'set' for Ps=3 (permanently set)", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?25;3$y"),
      DecMode.CURSOR_VISIBLE,
    )
    expect(result).toBe("set")
  })

  test("returns 'reset' for Ps=4 (permanently reset)", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?25;4$y"),
      DecMode.CURSOR_VISIBLE,
    )
    expect(result).toBe("reset")
  })

  test("returns 'unknown' on timeout", async () => {
    const result = await queryMode(createCapture().write, mockRead(null), DecMode.ALT_SCREEN, 10)
    expect(result).toBe("unknown")
  })

  test("returns 'unknown' on garbage response", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("garbage"),
      DecMode.ALT_SCREEN,
    )
    expect(result).toBe("unknown")
  })

  test("returns 'unknown' when response mode number doesn't match", async () => {
    // Queried 1049 but response says 2004
    const result = await queryMode(
      createCapture().write,
      mockRead("\x1b[?2004;1$y"),
      DecMode.ALT_SCREEN,
    )
    expect(result).toBe("unknown")
  })

  test("parses response embedded in other data", async () => {
    const result = await queryMode(
      createCapture().write,
      mockRead("noise\x1b[?2004;1$yextra"),
      DecMode.BRACKETED_PASTE,
    )
    expect(result).toBe("set")
  })
})

// ============================================================================
// queryModes
// ============================================================================

describe("queryModes", () => {
  test("queries multiple modes sequentially", async () => {
    let callCount = 0
    const responses = [
      "\x1b[?1049;1$y", // ALT_SCREEN = set
      "\x1b[?2004;2$y", // BRACKETED_PASTE = reset
    ]

    const read = (_ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        resolve(responses[callCount++] ?? null)
      })

    const results = await queryModes(
      createCapture().write,
      read,
      [DecMode.ALT_SCREEN, DecMode.BRACKETED_PASTE],
    )

    expect(results.get(DecMode.ALT_SCREEN)).toBe("set")
    expect(results.get(DecMode.BRACKETED_PASTE)).toBe("reset")
    expect(results.size).toBe(2)
  })

  test("handles empty modes array", async () => {
    const results = await queryModes(createCapture().write, mockRead(null), [])
    expect(results.size).toBe(0)
  })

  test("handles all timeouts", async () => {
    const results = await queryModes(
      createCapture().write,
      mockRead(null),
      [DecMode.ALT_SCREEN, DecMode.BRACKETED_PASTE],
      10,
    )
    expect(results.get(DecMode.ALT_SCREEN)).toBe("unknown")
    expect(results.get(DecMode.BRACKETED_PASTE)).toBe("unknown")
  })
})

// ============================================================================
// DecMode constants
// ============================================================================

describe("DecMode", () => {
  test("has expected constant values", () => {
    expect(DecMode.CURSOR_VISIBLE).toBe(25)
    expect(DecMode.ALT_SCREEN).toBe(1049)
    expect(DecMode.MOUSE_TRACKING).toBe(1000)
    expect(DecMode.BRACKETED_PASTE).toBe(2004)
    expect(DecMode.SYNC_OUTPUT).toBe(2026)
    expect(DecMode.FOCUS_REPORTING).toBe(1004)
  })
})
