/**
 * Tests for scroll region (DECSTBM) utilities.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "../src/scroll-region.js"

function createMockStdout() {
  const chunks: string[] = []
  return {
    write: vi.fn((data: string) => {
      chunks.push(data)
      return true
    }),
    chunks,
  }
}

describe("scroll region utilities", () => {
  describe("setScrollRegion", () => {
    test("writes correct DECSTBM sequence with 1-indexed rows", () => {
      const mock = createMockStdout()
      setScrollRegion(mock as unknown as NodeJS.WriteStream, 5, 20)
      expect(mock.write).toHaveBeenCalledWith("\x1b[5;20r")
    })

    test("handles single-row region", () => {
      const mock = createMockStdout()
      setScrollRegion(mock as unknown as NodeJS.WriteStream, 1, 1)
      expect(mock.write).toHaveBeenCalledWith("\x1b[1;1r")
    })
  })

  describe("resetScrollRegion", () => {
    test("writes reset sequence", () => {
      const mock = createMockStdout()
      resetScrollRegion(mock as unknown as NodeJS.WriteStream)
      expect(mock.write).toHaveBeenCalledWith("\x1b[r")
    })
  })

  describe("scrollUp", () => {
    test("writes correct SU sequence with default 1 line", () => {
      const mock = createMockStdout()
      scrollUp(mock as unknown as NodeJS.WriteStream)
      expect(mock.write).toHaveBeenCalledWith("\x1b[1S")
    })

    test("writes correct SU sequence with custom line count", () => {
      const mock = createMockStdout()
      scrollUp(mock as unknown as NodeJS.WriteStream, 5)
      expect(mock.write).toHaveBeenCalledWith("\x1b[5S")
    })
  })

  describe("scrollDown", () => {
    test("writes correct SD sequence with default 1 line", () => {
      const mock = createMockStdout()
      scrollDown(mock as unknown as NodeJS.WriteStream)
      expect(mock.write).toHaveBeenCalledWith("\x1b[1T")
    })

    test("writes correct SD sequence with custom line count", () => {
      const mock = createMockStdout()
      scrollDown(mock as unknown as NodeJS.WriteStream, 3)
      expect(mock.write).toHaveBeenCalledWith("\x1b[3T")
    })
  })

  describe("moveCursor", () => {
    test("writes correct CUP sequence with 1-indexed coordinates", () => {
      const mock = createMockStdout()
      moveCursor(mock as unknown as NodeJS.WriteStream, 10, 5)
      expect(mock.write).toHaveBeenCalledWith("\x1b[10;5H")
    })

    test("writes home position", () => {
      const mock = createMockStdout()
      moveCursor(mock as unknown as NodeJS.WriteStream, 1, 1)
      expect(mock.write).toHaveBeenCalledWith("\x1b[1;1H")
    })
  })
})

describe("supportsScrollRegions", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.TERM
    delete process.env.TERM_PROGRAM
  })

  afterEach(() => {
    process.env.TERM = originalEnv.TERM
    process.env.TERM_PROGRAM = originalEnv.TERM_PROGRAM
  })

  test("returns true for ghostty", () => {
    process.env.TERM_PROGRAM = "ghostty"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for iTerm2", () => {
    process.env.TERM_PROGRAM = "iTerm.app"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for WezTerm", () => {
    process.env.TERM_PROGRAM = "WezTerm"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for vscode", () => {
    process.env.TERM_PROGRAM = "vscode"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for xterm-256color", () => {
    process.env.TERM = "xterm-256color"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for xterm", () => {
    process.env.TERM = "xterm"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for kitty", () => {
    process.env.TERM = "xterm-kitty"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for screen", () => {
    process.env.TERM = "screen"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for tmux", () => {
    process.env.TERM = "tmux-256color"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns false for linux console", () => {
    process.env.TERM = "linux"
    expect(supportsScrollRegions()).toBe(false)
  })

  test("returns false when TERM is empty and no TERM_PROGRAM", () => {
    process.env.TERM = ""
    expect(supportsScrollRegions()).toBe(false)
  })

  test("returns false when TERM is unset and no TERM_PROGRAM", () => {
    // Both deleted in beforeEach
    expect(supportsScrollRegions()).toBe(false)
  })

  test("returns true for unknown TERM_PROGRAM but known TERM", () => {
    process.env.TERM_PROGRAM = "unknown-terminal"
    process.env.TERM = "xterm-256color"
    expect(supportsScrollRegions()).toBe(true)
  })

  test("returns true for unknown non-empty TERM", () => {
    process.env.TERM = "rxvt-unicode"
    expect(supportsScrollRegions()).toBe(true)
  })
})
