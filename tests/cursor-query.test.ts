/**
 * CSI 6n Cursor Position Query Tests
 */

import { describe, expect, test } from "vitest"
import { queryCursorPosition } from "../src/cursor-query.js"

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

describe("queryCursorPosition", () => {
  test("sends CSI 6n query", async () => {
    const cap = createCapture()
    await queryCursorPosition(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[6n")
  })

  test("parses standard CPR response", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("\x1b[1;1R"))
    expect(result).toEqual({ row: 1, col: 1 })
  })

  test("parses multi-digit row and col", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("\x1b[24;80R"))
    expect(result).toEqual({ row: 24, col: 80 })
  })

  test("parses large row and col values", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("\x1b[999;999R"))
    expect(result).toEqual({ row: 999, col: 999 })
  })

  test("returns null on timeout", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("garbage data"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("noise\x1b[5;10Rmore"))
    expect(result).toEqual({ row: 5, col: 10 })
  })

  test("returns null for empty string response", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead(""))
    expect(result).toBeNull()
  })

  test("returns null for partial CSI sequence", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("\x1b[6"))
    expect(result).toBeNull()
  })

  test("returns null for CSI without R terminator", async () => {
    const result = await queryCursorPosition(createCapture().write, mockRead("\x1b[1;1"))
    expect(result).toBeNull()
  })
})
