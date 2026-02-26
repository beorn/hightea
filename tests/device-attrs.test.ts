/**
 * DA1/DA2/DA3 + XTVERSION Device Attribute Tests
 */

import { describe, expect, test } from "vitest"
import { queryPrimaryDA, querySecondaryDA, queryTertiaryDA, queryTerminalVersion } from "../src/device-attrs.js"

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
// DA1 — Primary Device Attributes
// ============================================================================

describe("queryPrimaryDA", () => {
  test("sends CSI c query", async () => {
    const cap = createCapture()
    await queryPrimaryDA(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[c")
  })

  test("parses single param response", async () => {
    const result = await queryPrimaryDA(createCapture().write, mockRead("\x1b[?1c"))
    expect(result).toEqual({ params: [1] })
  })

  test("parses multi-param response (xterm-like)", async () => {
    // xterm typically responds: CSI ? 64 ; 1 ; 2 ; 6 ; 9 ; 15 ; 18 ; 21 ; 22 c
    const result = await queryPrimaryDA(createCapture().write, mockRead("\x1b[?64;1;2;6;9;15;18;21;22c"))
    expect(result).toEqual({ params: [64, 1, 2, 6, 9, 15, 18, 21, 22] })
  })

  test("parses VT100-like response", async () => {
    const result = await queryPrimaryDA(createCapture().write, mockRead("\x1b[?1;2c"))
    expect(result).toEqual({ params: [1, 2] })
  })

  test("returns null on timeout", async () => {
    const result = await queryPrimaryDA(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await queryPrimaryDA(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await queryPrimaryDA(createCapture().write, mockRead("noise\x1b[?62;1;4c"))
    expect(result).toEqual({ params: [62, 1, 4] })
  })
})

// ============================================================================
// DA2 — Secondary Device Attributes
// ============================================================================

describe("querySecondaryDA", () => {
  test("sends CSI > c query", async () => {
    const cap = createCapture()
    await querySecondaryDA(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[>c")
  })

  test("parses xterm-like response", async () => {
    // xterm: CSI > 41 ; 388 ; 0 c
    const result = await querySecondaryDA(createCapture().write, mockRead("\x1b[>41;388;0c"))
    expect(result).toEqual({ type: 41, version: 388, id: 0 })
  })

  test("parses VT220-like response", async () => {
    const result = await querySecondaryDA(createCapture().write, mockRead("\x1b[>1;95;0c"))
    expect(result).toEqual({ type: 1, version: 95, id: 0 })
  })

  test("returns null on timeout", async () => {
    const result = await querySecondaryDA(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage", async () => {
    const result = await querySecondaryDA(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })

  test("returns null if fewer than 3 params", async () => {
    const result = await querySecondaryDA(createCapture().write, mockRead("\x1b[>41;388c"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await querySecondaryDA(createCapture().write, mockRead("noise\x1b[>65;100;1cmore"))
    expect(result).toEqual({ type: 65, version: 100, id: 1 })
  })
})

// ============================================================================
// DA3 — Tertiary Device Attributes
// ============================================================================

describe("queryTertiaryDA", () => {
  test("sends CSI = c query", async () => {
    const cap = createCapture()
    await queryTertiaryDA(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[=c")
  })

  test("parses hex-encoded unit ID", async () => {
    // DCS ! | 7E565434 ST
    const result = await queryTertiaryDA(createCapture().write, mockRead("\x1bP!|7E565434\x1b\\"))
    expect(result).toBe("7E565434")
  })

  test("parses empty unit ID", async () => {
    const result = await queryTertiaryDA(createCapture().write, mockRead("\x1bP!|\x1b\\"))
    expect(result).toBe("")
  })

  test("returns null on timeout", async () => {
    const result = await queryTertiaryDA(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage", async () => {
    const result = await queryTertiaryDA(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })
})

// ============================================================================
// XTVERSION — Terminal Name + Version
// ============================================================================

describe("queryTerminalVersion", () => {
  test("sends CSI > 0 q query", async () => {
    const cap = createCapture()
    await queryTerminalVersion(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b[>0q")
  })

  test("parses xterm version string", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead("\x1bP>|xterm(388)\x1b\\"))
    expect(result).toBe("xterm(388)")
  })

  test("parses tmux version string", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead("\x1bP>|tmux 3.4\x1b\\"))
    expect(result).toBe("tmux 3.4")
  })

  test("parses WezTerm version string", async () => {
    const result = await queryTerminalVersion(
      createCapture().write,
      mockRead("\x1bP>|WezTerm 20230712-072601-f4abf8fd\x1b\\"),
    )
    expect(result).toBe("WezTerm 20230712-072601-f4abf8fd")
  })

  test("parses Ghostty version string", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead("\x1bP>|ghostty 1.0.0\x1b\\"))
    expect(result).toBe("ghostty 1.0.0")
  })

  test("returns null on timeout", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead("garbage"))
    expect(result).toBeNull()
  })

  test("parses response embedded in other data", async () => {
    const result = await queryTerminalVersion(createCapture().write, mockRead("noise\x1bP>|foot(1.16.2)\x1b\\more"))
    expect(result).toBe("foot(1.16.2)")
  })
})
