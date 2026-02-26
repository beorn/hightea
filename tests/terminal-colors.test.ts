/**
 * OSC 10/11/12 Terminal Color Query Tests
 */

import { describe, expect, test } from "vitest"
import {
  queryForegroundColor,
  queryBackgroundColor,
  queryCursorColor,
  setForegroundColor,
  setBackgroundColor,
  setCursorColor,
  resetForegroundColor,
  resetBackgroundColor,
  resetCursorColor,
  detectColorScheme,
} from "../src/terminal-colors.js"

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
// Query Functions
// ============================================================================

describe("queryForegroundColor", () => {
  test("sends correct OSC 10 query", async () => {
    const cap = createCapture()
    await queryForegroundColor(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b]10;?\x07")
  })

  test("parses 4-digit hex response with BEL terminator", async () => {
    const result = await queryForegroundColor(createCapture().write, mockRead("\x1b]10;rgb:ffff/ffff/ffff\x07"))
    expect(result).toBe("#ffffff")
  })

  test("parses 4-digit hex response with ST terminator", async () => {
    const result = await queryForegroundColor(createCapture().write, mockRead("\x1b]10;rgb:0000/0000/0000\x1b\\"))
    expect(result).toBe("#000000")
  })

  test("parses 2-digit hex response", async () => {
    const result = await queryForegroundColor(createCapture().write, mockRead("\x1b]10;rgb:ff/00/ff\x07"))
    expect(result).toBe("#ff00ff")
  })

  test("returns null on timeout", async () => {
    const result = await queryForegroundColor(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await queryForegroundColor(createCapture().write, mockRead("not an osc"))
    expect(result).toBeNull()
  })
})

describe("queryBackgroundColor", () => {
  test("sends correct OSC 11 query", async () => {
    const cap = createCapture()
    await queryBackgroundColor(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b]11;?\x07")
  })

  test("parses dark background", async () => {
    const result = await queryBackgroundColor(createCapture().write, mockRead("\x1b]11;rgb:1c1c/1c1c/1c1c\x07"))
    expect(result).toBe("#1c1c1c")
  })

  test("parses white background", async () => {
    const result = await queryBackgroundColor(createCapture().write, mockRead("\x1b]11;rgb:ffff/ffff/ffff\x07"))
    expect(result).toBe("#ffffff")
  })
})

describe("queryCursorColor", () => {
  test("sends correct OSC 12 query", async () => {
    const cap = createCapture()
    await queryCursorColor(cap.write, mockRead(null), 10)
    expect(cap.output()).toBe("\x1b]12;?\x07")
  })

  test("parses cursor color response", async () => {
    const result = await queryCursorColor(createCapture().write, mockRead("\x1b]12;rgb:ff/aa/00\x07"))
    expect(result).toBe("#ffaa00")
  })
})

// ============================================================================
// Set Functions
// ============================================================================

describe("setForegroundColor", () => {
  test("sends correct OSC 10 set sequence", () => {
    const cap = createCapture()
    setForegroundColor(cap.write, "#ff0000")
    expect(cap.output()).toBe("\x1b]10;#ff0000\x07")
  })

  test("sends rgb: format", () => {
    const cap = createCapture()
    setForegroundColor(cap.write, "rgb:ff/00/00")
    expect(cap.output()).toBe("\x1b]10;rgb:ff/00/00\x07")
  })
})

describe("setBackgroundColor", () => {
  test("sends correct OSC 11 set sequence", () => {
    const cap = createCapture()
    setBackgroundColor(cap.write, "#000000")
    expect(cap.output()).toBe("\x1b]11;#000000\x07")
  })
})

describe("setCursorColor", () => {
  test("sends correct OSC 12 set sequence", () => {
    const cap = createCapture()
    setCursorColor(cap.write, "#00ff00")
    expect(cap.output()).toBe("\x1b]12;#00ff00\x07")
  })
})

// ============================================================================
// Reset Functions
// ============================================================================

describe("resetForegroundColor", () => {
  test("sends correct OSC 110 reset", () => {
    const cap = createCapture()
    resetForegroundColor(cap.write)
    expect(cap.output()).toBe("\x1b]110\x07")
  })
})

describe("resetBackgroundColor", () => {
  test("sends correct OSC 111 reset", () => {
    const cap = createCapture()
    resetBackgroundColor(cap.write)
    expect(cap.output()).toBe("\x1b]111\x07")
  })
})

describe("resetCursorColor", () => {
  test("sends correct OSC 112 reset", () => {
    const cap = createCapture()
    resetCursorColor(cap.write)
    expect(cap.output()).toBe("\x1b]112\x07")
  })
})

// ============================================================================
// Theme Detection
// ============================================================================

describe("detectColorScheme", () => {
  test("detects dark theme from dark background", async () => {
    // rgb:1c1c/1c1c/1c1c → #1c1c1c → very low luminance
    const result = await detectColorScheme(createCapture().write, mockRead("\x1b]11;rgb:1c1c/1c1c/1c1c\x07"))
    expect(result).toBe("dark")
  })

  test("detects light theme from white background", async () => {
    const result = await detectColorScheme(createCapture().write, mockRead("\x1b]11;rgb:ffff/ffff/ffff\x07"))
    expect(result).toBe("light")
  })

  test("detects dark theme from pure black", async () => {
    const result = await detectColorScheme(createCapture().write, mockRead("\x1b]11;rgb:0000/0000/0000\x07"))
    expect(result).toBe("dark")
  })

  test("detects light theme from light gray", async () => {
    // #cccccc → luminance ~ 0.6 → light
    const result = await detectColorScheme(createCapture().write, mockRead("\x1b]11;rgb:cc/cc/cc\x07"))
    expect(result).toBe("light")
  })

  test("returns null on timeout", async () => {
    const result = await detectColorScheme(createCapture().write, mockRead(null), 10)
    expect(result).toBeNull()
  })

  test("returns null on garbage response", async () => {
    const result = await detectColorScheme(createCapture().write, mockRead("not an osc"))
    expect(result).toBeNull()
  })
})
