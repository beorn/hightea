/**
 * Text sizing probe tests.
 *
 * Tests for OSC 66 progressive enhancement:
 * - Probe correctly detects supported terminal (mock write/read)
 * - Probe correctly handles timeout
 * - Probe result caching works
 * - Heuristic fallback works when probe is not available
 */
import { describe, expect, test, beforeEach } from "vitest"
import {
  detectTextSizingSupport,
  isTextSizingLikelySupported,
  getTerminalFingerprint,
  getCachedProbeResult,
  setCachedProbeResult,
  clearProbeCache,
  type TextSizingProbeResult,
} from "../packages/ag-term/src/text-sizing"

// ============================================================================
// Probe detection
// ============================================================================

describe("detectTextSizingSupport", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("detects support when cursor advances by 2 columns", async () => {
    // CPR response: cursor at row 1, column 3 (1-indexed)
    // means the space wrapped in OSC 66 w=2 occupied 2 cells
    let written = ""
    const write = (data: string) => {
      written += data
    }
    const read = () => Promise.resolve("\x1b[1;3R")

    const result = await detectTextSizingSupport(write, read)

    expect(result.supported).toBe(true)
    expect(result.widthOnly).toBe(false)
    // Should have written the probe sequence
    expect(written).toContain("\x1b]66;w=2;")
    expect(written).toContain("\x1b[6n")
  })

  test("detects no support when cursor advances by 1 column", async () => {
    // CPR response: cursor at row 1, column 2 (1-indexed)
    // means the terminal ignored OSC 66 and the space occupied 1 cell
    const write = (_data: string) => {}
    const read = () => Promise.resolve("\x1b[1;2R")

    const result = await detectTextSizingSupport(write, read)

    expect(result.supported).toBe(false)
    expect(result.widthOnly).toBe(false)
  })

  test("detects no support when CPR response is malformed", async () => {
    const write = (_data: string) => {}
    const read = () => Promise.resolve("garbage data")

    const result = await detectTextSizingSupport(write, read)

    expect(result.supported).toBe(false)
  })

  test("detects no support when CPR shows column 1 (no movement)", async () => {
    const write = (_data: string) => {}
    const read = () => Promise.resolve("\x1b[1;1R")

    const result = await detectTextSizingSupport(write, read)

    expect(result.supported).toBe(false)
  })
})

// ============================================================================
// Timeout handling
// ============================================================================

describe("probe timeout", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("returns not supported on timeout", async () => {
    const write = (_data: string) => {}
    // read() that never resolves
    const read = () => new Promise<string>(() => {})

    const result = await detectTextSizingSupport(write, read, 50)

    expect(result.supported).toBe(false)
    expect(result.widthOnly).toBe(false)
  })

  test("returns not supported when read rejects", async () => {
    const write = (_data: string) => {}
    const read = () => Promise.reject(new Error("stdin closed"))

    const result = await detectTextSizingSupport(write, read)

    expect(result.supported).toBe(false)
  })
})

// ============================================================================
// Cache
// ============================================================================

describe("probe result caching", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("caches successful probe result", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;3R")
    }

    // First call — runs the probe
    const result1 = await detectTextSizingSupport(write, read)
    expect(result1.supported).toBe(true)
    expect(readCount).toBe(1)

    // Second call — should use cache, not call read again
    const result2 = await detectTextSizingSupport(write, read)
    expect(result2.supported).toBe(true)
    expect(readCount).toBe(1)
  })

  test("caches negative probe result", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;2R")
    }

    const result1 = await detectTextSizingSupport(write, read)
    expect(result1.supported).toBe(false)
    expect(readCount).toBe(1)

    const result2 = await detectTextSizingSupport(write, read)
    expect(result2.supported).toBe(false)
    expect(readCount).toBe(1)
  })

  test("clearProbeCache resets cache", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;3R")
    }

    await detectTextSizingSupport(write, read)
    expect(readCount).toBe(1)

    clearProbeCache()

    await detectTextSizingSupport(write, read)
    expect(readCount).toBe(2)
  })

  test("getTerminalFingerprint combines program and version", () => {
    const original = {
      program: process.env.TERM_PROGRAM,
      version: process.env.TERM_PROGRAM_VERSION,
    }

    try {
      process.env.TERM_PROGRAM = "kitty"
      process.env.TERM_PROGRAM_VERSION = "0.40.0"
      expect(getTerminalFingerprint()).toBe("kitty@0.40.0")

      process.env.TERM_PROGRAM = "Ghostty"
      process.env.TERM_PROGRAM_VERSION = "1.3.0"
      expect(getTerminalFingerprint()).toBe("Ghostty@1.3.0")
    } finally {
      if (original.program !== undefined) process.env.TERM_PROGRAM = original.program
      else delete process.env.TERM_PROGRAM
      if (original.version !== undefined) process.env.TERM_PROGRAM_VERSION = original.version
      else delete process.env.TERM_PROGRAM_VERSION
    }
  })

  test("getCachedProbeResult returns undefined when no cache", () => {
    expect(getCachedProbeResult()).toBeUndefined()
  })

  test("setCachedProbeResult stores and retrieves result", () => {
    const result: TextSizingProbeResult = { supported: true, widthOnly: false }
    setCachedProbeResult(result)

    expect(getCachedProbeResult()).toEqual(result)
  })
})

// ============================================================================
// Heuristic fallback
// ============================================================================

describe("isTextSizingLikelySupported heuristic", () => {
  test("returns true for Kitty >= 0.40", () => {
    const original = {
      program: process.env.TERM_PROGRAM,
      version: process.env.TERM_PROGRAM_VERSION,
    }

    try {
      process.env.TERM_PROGRAM = "kitty"
      process.env.TERM_PROGRAM_VERSION = "0.40.0"
      expect(isTextSizingLikelySupported()).toBe(true)

      process.env.TERM_PROGRAM_VERSION = "0.41.0"
      expect(isTextSizingLikelySupported()).toBe(true)

      process.env.TERM_PROGRAM_VERSION = "1.0.0"
      expect(isTextSizingLikelySupported()).toBe(true)
    } finally {
      if (original.program !== undefined) process.env.TERM_PROGRAM = original.program
      else delete process.env.TERM_PROGRAM
      if (original.version !== undefined) process.env.TERM_PROGRAM_VERSION = original.version
      else delete process.env.TERM_PROGRAM_VERSION
    }
  })

  test("returns false for Kitty < 0.40", () => {
    const original = {
      program: process.env.TERM_PROGRAM,
      version: process.env.TERM_PROGRAM_VERSION,
    }

    try {
      process.env.TERM_PROGRAM = "kitty"
      process.env.TERM_PROGRAM_VERSION = "0.39.0"
      expect(isTextSizingLikelySupported()).toBe(false)

      process.env.TERM_PROGRAM_VERSION = "0.35.0"
      expect(isTextSizingLikelySupported()).toBe(false)
    } finally {
      if (original.program !== undefined) process.env.TERM_PROGRAM = original.program
      else delete process.env.TERM_PROGRAM
      if (original.version !== undefined) process.env.TERM_PROGRAM_VERSION = original.version
      else delete process.env.TERM_PROGRAM_VERSION
    }
  })

  test("returns false for Ghostty (known broken OSC 66)", () => {
    const original = {
      program: process.env.TERM_PROGRAM,
      version: process.env.TERM_PROGRAM_VERSION,
    }

    try {
      process.env.TERM_PROGRAM = "ghostty"
      process.env.TERM_PROGRAM_VERSION = "1.3.0"
      expect(isTextSizingLikelySupported()).toBe(false)
    } finally {
      if (original.program !== undefined) process.env.TERM_PROGRAM = original.program
      else delete process.env.TERM_PROGRAM
      if (original.version !== undefined) process.env.TERM_PROGRAM_VERSION = original.version
      else delete process.env.TERM_PROGRAM_VERSION
    }
  })

  test("returns false for unknown terminals", () => {
    const original = {
      program: process.env.TERM_PROGRAM,
      version: process.env.TERM_PROGRAM_VERSION,
    }

    try {
      process.env.TERM_PROGRAM = "some-unknown-terminal"
      process.env.TERM_PROGRAM_VERSION = "1.0.0"
      expect(isTextSizingLikelySupported()).toBe(false)
    } finally {
      if (original.program !== undefined) process.env.TERM_PROGRAM = original.program
      else delete process.env.TERM_PROGRAM
      if (original.version !== undefined) process.env.TERM_PROGRAM_VERSION = original.version
      else delete process.env.TERM_PROGRAM_VERSION
    }
  })

  test("returns false when TERM_PROGRAM is unset", () => {
    const original = process.env.TERM_PROGRAM
    try {
      delete process.env.TERM_PROGRAM
      expect(isTextSizingLikelySupported()).toBe(false)
    } finally {
      if (original !== undefined) process.env.TERM_PROGRAM = original
      else delete process.env.TERM_PROGRAM
    }
  })
})
