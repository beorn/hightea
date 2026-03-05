/**
 * Tests for terminal capability detection
 */

import { describe, it, expect, afterEach } from "vitest"
import { detectExtendedUnderline } from "../src/detection.js"

describe("terminal detection", () => {
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

  describe("TERM variable detection", () => {
    it("detects support via TERM=xterm-ghostty", () => {
      process.env.TERM = "xterm-ghostty"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(true)
    })

    it("detects support via TERM=xterm-kitty", () => {
      process.env.TERM = "xterm-kitty"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(true)
    })

    it("detects support via TERM=wezterm", () => {
      process.env.TERM = "wezterm"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(true)
    })
  })

  describe("KITTY_WINDOW_ID detection", () => {
    it("detects support via KITTY_WINDOW_ID", () => {
      process.env.TERM = "xterm-256color"
      process.env.KITTY_WINDOW_ID = "1"
      expect(detectExtendedUnderline()).toBe(true)
    })
  })

  describe("TERM_PROGRAM detection", () => {
    it("detects support via TERM_PROGRAM=iTerm.app", () => {
      process.env.TERM = "xterm-256color"
      process.env.TERM_PROGRAM = "iTerm.app"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(true)
    })

    it("does not detect support for Apple_Terminal", () => {
      process.env.TERM = "xterm"
      process.env.TERM_PROGRAM = "Apple_Terminal"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(false)
    })

    it("does not detect support for Apple_Terminal even with xterm-256color", () => {
      // Apple Terminal sets TERM=xterm-256color, which is in EXTENDED_UNDERLINE_TERMS
      // But Terminal.app does NOT support extended underlines (SGR 4:x, SGR 58)
      // and misinterprets them as background colors
      process.env.TERM = "xterm-256color"
      process.env.TERM_PROGRAM = "Apple_Terminal"
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(false)
    })
  })

  describe("no support", () => {
    it("returns false for unknown terminals", () => {
      process.env.TERM = "dumb"
      delete process.env.TERM_PROGRAM
      delete process.env.KITTY_WINDOW_ID
      expect(detectExtendedUnderline()).toBe(false)
    })
  })
})
