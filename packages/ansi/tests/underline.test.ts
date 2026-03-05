/**
 * Tests for extended underline functions
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import chalk from "chalk"
import {
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "../src/underline.js"
import { stripAnsi } from "../src/utils.js"

describe("extended underlines", () => {
  // Save original env values
  const origTerm = process.env.TERM
  const origTermProgram = process.env.TERM_PROGRAM
  const origKitty = process.env.KITTY_WINDOW_ID

  afterEach(() => {
    // Restore env after each test
    if (origTerm !== undefined) process.env.TERM = origTerm
    else delete process.env.TERM
    if (origTermProgram !== undefined) {
      process.env.TERM_PROGRAM = origTermProgram
    } else delete process.env.TERM_PROGRAM
    if (origKitty !== undefined) process.env.KITTY_WINDOW_ID = origKitty
    else delete process.env.KITTY_WINDOW_ID
  })

  describe("with support enabled", () => {
    beforeEach(() => {
      // Force env to trigger detectExtendedUnderline() === true
      process.env.TERM = "xterm-ghostty"
      chalk.level = 3
    })

    it("underline with style='single' uses chalk underline", () => {
      const result = underline("text", "single")
      // Single style should fall through to chalk.underline
      expect(result).toContain("\x1b[4m")
      expect(stripAnsi(result)).toBe("text")
    })

    it("curlyUnderline applies SGR 4:3", () => {
      const result = curlyUnderline("wavy")
      expect(result).toContain("\x1b[4:3m")
      expect(result).toContain("wavy")
      expect(result).toContain("\x1b[4:0m") // Reset
    })

    it("dottedUnderline applies SGR 4:4", () => {
      const result = dottedUnderline("dots")
      expect(result).toContain("\x1b[4:4m")
      expect(stripAnsi(result)).toBe("dots")
    })

    it("dashedUnderline applies SGR 4:5", () => {
      const result = dashedUnderline("dashes")
      expect(result).toContain("\x1b[4:5m")
      expect(stripAnsi(result)).toBe("dashes")
    })

    it("doubleUnderline applies SGR 4:2", () => {
      const result = doubleUnderline("double")
      expect(result).toContain("\x1b[4:2m")
      expect(stripAnsi(result)).toBe("double")
    })
  })

  describe("fallback with support disabled", () => {
    beforeEach(() => {
      // Force env to trigger detectExtendedUnderline() === false
      process.env.TERM = "dumb"
      delete process.env.TERM_PROGRAM
      delete process.env.KITTY_WINDOW_ID
      chalk.level = 3
    })

    it("curlyUnderline falls back to regular underline", () => {
      const result = curlyUnderline("text")
      expect(result).not.toContain("\x1b[4:3m")
      expect(result).toContain("\x1b[4m") // Standard underline
      expect(stripAnsi(result)).toBe("text")
    })

    it("dottedUnderline falls back to regular underline", () => {
      const result = dottedUnderline("text")
      expect(result).not.toContain("\x1b[4:4m")
      expect(stripAnsi(result)).toBe("text")
    })

    it("dashedUnderline falls back to regular underline", () => {
      const result = dashedUnderline("text")
      expect(result).not.toContain("\x1b[4:5m")
      expect(stripAnsi(result)).toBe("text")
    })

    it("doubleUnderline falls back to regular underline", () => {
      const result = doubleUnderline("text")
      expect(result).not.toContain("\x1b[4:2m")
      expect(stripAnsi(result)).toBe("text")
    })
  })

  describe("edge cases", () => {
    beforeEach(() => {
      process.env.TERM = "xterm-ghostty"
    })

    it("handles empty string", () => {
      const result = curlyUnderline("")
      expect(stripAnsi(result)).toBe("")
    })

    it("handles string with spaces", () => {
      const result = curlyUnderline("hello world")
      expect(stripAnsi(result)).toBe("hello world")
    })

    it("handles multi-line string", () => {
      const result = curlyUnderline("line1\nline2")
      expect(stripAnsi(result)).toBe("line1\nline2")
    })

    it("handles special characters", () => {
      const result = curlyUnderline("\u2192 \u2605 \u00a9 \u00ae")
      expect(stripAnsi(result)).toBe("\u2192 \u2605 \u00a9 \u00ae")
    })
  })
})

describe("underline color", () => {
  // Save original env values
  const origTerm = process.env.TERM
  const origTermProgram = process.env.TERM_PROGRAM
  const origKitty = process.env.KITTY_WINDOW_ID

  afterEach(() => {
    if (origTerm !== undefined) process.env.TERM = origTerm
    else delete process.env.TERM
    if (origTermProgram !== undefined) {
      process.env.TERM_PROGRAM = origTermProgram
    } else delete process.env.TERM_PROGRAM
    if (origKitty !== undefined) process.env.KITTY_WINDOW_ID = origKitty
    else delete process.env.KITTY_WINDOW_ID
  })

  describe("with support enabled", () => {
    beforeEach(() => {
      process.env.TERM = "xterm-ghostty"
    })

    it("underlineColor applies SGR 58 with RGB", () => {
      const result = underlineColor(255, 0, 128, "colored")
      expect(result).toContain("\x1b[58:2::255:0:128m")
      expect(result).toContain("\x1b[59m") // Color reset
      expect(stripAnsi(result)).toBe("colored")
    })

    it("styledUnderline combines style and color", () => {
      const result = styledUnderline("curly", [0, 255, 0], "styled")
      expect(result).toContain("\x1b[4:3m") // Curly
      expect(result).toContain("\x1b[58:2::0:255:0m") // Green
      expect(stripAnsi(result)).toBe("styled")
    })

    it("handles different RGB values", () => {
      const black = underlineColor(0, 0, 0, "black")
      expect(black).toContain("\x1b[58:2::0:0:0m")

      const white = underlineColor(255, 255, 255, "white")
      expect(white).toContain("\x1b[58:2::255:255:255m")
    })
  })

  describe("fallback with support disabled", () => {
    beforeEach(() => {
      process.env.TERM = "dumb"
      delete process.env.TERM_PROGRAM
      delete process.env.KITTY_WINDOW_ID
    })

    it("underlineColor falls back to regular underline", () => {
      const result = underlineColor(255, 0, 0, "text")
      expect(result).not.toContain("\x1b[58:")
      expect(stripAnsi(result)).toBe("text")
    })

    it("styledUnderline falls back to regular underline", () => {
      const result = styledUnderline("dashed", [255, 128, 0], "text")
      expect(result).not.toContain("\x1b[4:5m")
      expect(result).not.toContain("\x1b[58:")
      expect(stripAnsi(result)).toBe("text")
    })
  })
})
