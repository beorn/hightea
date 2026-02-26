/**
 * CSI 14t/18t Pixel and Text Area Size Query Tests
 */

import { describe, expect, test } from "vitest"
import { queryTextAreaPixels, queryTextAreaSize, queryCellSize } from "../src/pixel-size.js"

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
// queryTextAreaPixels
// ============================================================================

describe("queryTextAreaPixels", () => {
  test("sends CSI 14t query", async () => {
    const cap = createCapture()
    await queryTextAreaPixels(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[14t")
  })

  test("parses standard pixel size response", async () => {
    // CSI 4 ; 600 ; 1200 t (height=600, width=1200)
    const result = await queryTextAreaPixels(createCapture().write, mockRead("\x1b[4;600;1200t"))
    expect(result).toEqual({ height: 600, width: 1200 })
  })

  test("parses small terminal dimensions", async () => {
    const result = await queryTextAreaPixels(createCapture().write, mockRead("\x1b[4;100;200t"))
    expect(result).toEqual({ height: 100, width: 200 })
  })

  test("parses large terminal dimensions", async () => {
    const result = await queryTextAreaPixels(createCapture().write, mockRead("\x1b[4;2160;3840t"))
    expect(result).toEqual({ height: 2160, width: 3840 })
  })

  test("returns null on timeout", async () => {
    const result = await queryTextAreaPixels(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await queryTextAreaPixels(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await queryTextAreaPixels(createCapture().write, mockRead("noise\x1b[4;480;960tmore"))
    expect(result).toEqual({ height: 480, width: 960 })
  })
})

// ============================================================================
// queryTextAreaSize
// ============================================================================

describe("queryTextAreaSize", () => {
  test("sends CSI 18t query", async () => {
    const cap = createCapture()
    await queryTextAreaSize(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[18t")
  })

  test("parses standard text area size response", async () => {
    // CSI 8 ; 24 ; 80 t (rows=24, cols=80)
    const result = await queryTextAreaSize(createCapture().write, mockRead("\x1b[8;24;80t"))
    expect(result).toEqual({ rows: 24, cols: 80 })
  })

  test("parses large terminal", async () => {
    const result = await queryTextAreaSize(createCapture().write, mockRead("\x1b[8;60;200t"))
    expect(result).toEqual({ rows: 60, cols: 200 })
  })

  test("returns null on timeout", async () => {
    const result = await queryTextAreaSize(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await queryTextAreaSize(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await queryTextAreaSize(createCapture().write, mockRead("noise\x1b[8;40;120tmore"))
    expect(result).toEqual({ rows: 40, cols: 120 })
  })
})

// ============================================================================
// queryCellSize
// ============================================================================

describe("queryCellSize", () => {
  test("derives cell size from pixel and character dimensions", async () => {
    let callCount = 0
    const responses = [
      "\x1b[4;480;960t", // pixels: 480h x 960w
      "\x1b[8;24;80t", // chars: 24 rows x 80 cols
    ]

    const cap = createCapture()
    const read = (_ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        resolve(responses[callCount++] ?? null)
      })

    const result = await queryCellSize(cap.write, read)
    expect(result).toEqual({ width: 12, height: 20 })
  })

  test("returns null when pixel query fails", async () => {
    const result = await queryCellSize(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null when text area query fails", async () => {
    let callCount = 0
    const responses = [
      "\x1b[4;480;960t", // pixels succeed
      null, // chars fail
    ]

    const read = (_ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        const resp = responses[callCount++]
        if (resp == null) {
          setTimeout(() => resolve(null), _ms)
        } else {
          resolve(resp)
        }
      })

    const result = await queryCellSize(createCapture().write, read, 10)
    expect(result).toBeNull()
  })

  test("returns null when cols is zero (avoid division by zero)", async () => {
    let callCount = 0
    const responses = [
      "\x1b[4;480;960t", // pixels
      "\x1b[8;0;0t", // zero rows and cols
    ]

    const read = (_ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        resolve(responses[callCount++] ?? null)
      })

    const result = await queryCellSize(createCapture().write, read)
    expect(result).toBeNull()
  })

  test("handles non-integer cell sizes", async () => {
    let callCount = 0
    const responses = [
      "\x1b[4;500;1000t", // pixels: 500h x 1000w
      "\x1b[8;25;80t", // chars: 25 rows x 80 cols
    ]

    const read = (_ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        resolve(responses[callCount++] ?? null)
      })

    const result = await queryCellSize(createCapture().write, read)
    expect(result).toEqual({ width: 12.5, height: 20 })
  })
})
