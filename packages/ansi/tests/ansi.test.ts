import { describe, expect, test } from "vitest"
import {
  enterAltScreen,
  leaveAltScreen,
  clearScreen,
  clearLine,
  cursorTo,
  cursorHome,
  cursorHide,
  cursorShow,
  cursorStyle,
  setTitle,
  enableMouse,
  disableMouse,
  enableBracketedPaste,
  disableBracketedPaste,
  enableSyncUpdate,
  disableSyncUpdate,
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  enableKittyKeyboard,
  disableKittyKeyboard,
} from "../src/ansi.js"

const ESC = "\x1b"
const CSI = `${ESC}[`

describe("ansi helpers", () => {
  // ===========================================================================
  // Screen
  // ===========================================================================

  describe("screen", () => {
    test("enterAltScreen returns DEC 1049 set", () => {
      expect(enterAltScreen()).toBe(`${CSI}?1049h`)
    })

    test("leaveAltScreen returns DEC 1049 reset", () => {
      expect(leaveAltScreen()).toBe(`${CSI}?1049l`)
    })

    test("clearScreen returns ED 2", () => {
      expect(clearScreen()).toBe(`${CSI}2J`)
    })

    test("clearLine returns EL 2", () => {
      expect(clearLine()).toBe(`${CSI}2K`)
    })
  })

  // ===========================================================================
  // Cursor
  // ===========================================================================

  describe("cursor", () => {
    test("cursorTo converts 0-indexed to 1-indexed CUP", () => {
      expect(cursorTo(0, 0)).toBe(`${CSI}1;1H`)
      expect(cursorTo(5, 10)).toBe(`${CSI}6;11H`)
    })

    test("cursorHome moves to top-left", () => {
      expect(cursorHome()).toBe(`${CSI}H`)
    })

    test("cursorHide sets DEC 25 reset", () => {
      expect(cursorHide()).toBe(`${CSI}?25l`)
    })

    test("cursorShow sets DEC 25 set", () => {
      expect(cursorShow()).toBe(`${CSI}?25h`)
    })

    test.each([
      ["block", 2],
      ["underline", 4],
      ["beam", 6],
    ] as const)("cursorStyle(%s) sends DECSCUSR %d", (style, code) => {
      expect(cursorStyle(style)).toBe(`${CSI}${code} q`)
    })
  })

  // ===========================================================================
  // Terminal
  // ===========================================================================

  describe("terminal", () => {
    test("setTitle uses OSC 2", () => {
      expect(setTitle("My App")).toBe(`${ESC}]2;My App\x07`)
    })

    test("setTitle handles empty string", () => {
      expect(setTitle("")).toBe(`${ESC}]2;\x07`)
    })

    test("enableMouse enables modes 1000, 1002, 1006", () => {
      expect(enableMouse()).toBe(`${CSI}?1000h${CSI}?1002h${CSI}?1006h`)
    })

    test("disableMouse disables modes in reverse order", () => {
      expect(disableMouse()).toBe(`${CSI}?1006l${CSI}?1002l${CSI}?1000l`)
    })

    test("enableBracketedPaste sets DEC 2004", () => {
      expect(enableBracketedPaste()).toBe(`${CSI}?2004h`)
    })

    test("disableBracketedPaste resets DEC 2004", () => {
      expect(disableBracketedPaste()).toBe(`${CSI}?2004l`)
    })

    test("enableSyncUpdate sets DEC 2026", () => {
      expect(enableSyncUpdate()).toBe(`${CSI}?2026h`)
    })

    test("disableSyncUpdate resets DEC 2026", () => {
      expect(disableSyncUpdate()).toBe(`${CSI}?2026l`)
    })
  })

  // ===========================================================================
  // Scroll
  // ===========================================================================

  describe("scroll", () => {
    test("setScrollRegion converts 0-indexed to 1-indexed DECSTBM", () => {
      expect(setScrollRegion(0, 23)).toBe(`${CSI}1;24r`)
      expect(setScrollRegion(5, 20)).toBe(`${CSI}6;21r`)
    })

    test("resetScrollRegion sends bare CSI r", () => {
      expect(resetScrollRegion()).toBe(`${CSI}r`)
    })

    test("scrollUp sends SU sequence", () => {
      expect(scrollUp(1)).toBe(`${CSI}1S`)
      expect(scrollUp(5)).toBe(`${CSI}5S`)
    })

    test("scrollUp returns empty for n <= 0", () => {
      expect(scrollUp(0)).toBe("")
      expect(scrollUp(-1)).toBe("")
    })

    test("scrollDown sends SD sequence", () => {
      expect(scrollDown(1)).toBe(`${CSI}1T`)
      expect(scrollDown(3)).toBe(`${CSI}3T`)
    })

    test("scrollDown returns empty for n <= 0", () => {
      expect(scrollDown(0)).toBe("")
      expect(scrollDown(-1)).toBe("")
    })
  })

  // ===========================================================================
  // Keyboard
  // ===========================================================================

  describe("keyboard", () => {
    test("enableKittyKeyboard sends CSI > flags u", () => {
      expect(enableKittyKeyboard(1)).toBe(`${CSI}>1u`)
      expect(enableKittyKeyboard(3)).toBe(`${CSI}>3u`)
      expect(enableKittyKeyboard(31)).toBe(`${CSI}>31u`)
    })

    test("disableKittyKeyboard sends CSI < u", () => {
      expect(disableKittyKeyboard()).toBe(`${CSI}<u`)
    })
  })

  // ===========================================================================
  // All helpers return strings
  // ===========================================================================

  describe("return type", () => {
    test("all helpers return strings", () => {
      const results = [
        enterAltScreen(),
        leaveAltScreen(),
        clearScreen(),
        clearLine(),
        cursorTo(0, 0),
        cursorHome(),
        cursorHide(),
        cursorShow(),
        cursorStyle("block"),
        setTitle("test"),
        enableMouse(),
        disableMouse(),
        enableBracketedPaste(),
        disableBracketedPaste(),
        enableSyncUpdate(),
        disableSyncUpdate(),
        setScrollRegion(0, 23),
        resetScrollRegion(),
        scrollUp(1),
        scrollDown(1),
        enableKittyKeyboard(1),
        disableKittyKeyboard(),
      ]

      for (const result of results) {
        expect(typeof result).toBe("string")
        expect(result.length).toBeGreaterThan(0)
      }
    })
  })

  // ===========================================================================
  // Composability
  // ===========================================================================

  describe("composability", () => {
    test("helpers can be concatenated for composite sequences", () => {
      // Enter alt screen + clear + hide cursor (common TUI startup)
      const startup = enterAltScreen() + clearScreen() + cursorHome() + cursorHide()
      expect(startup).toBe(`${CSI}?1049h${CSI}2J${CSI}H${CSI}?25l`)
    })

    test("cleanup sequence restores terminal state", () => {
      const cleanup = disableSyncUpdate() + cursorShow() + leaveAltScreen()
      expect(cleanup).toBe(`${CSI}?2026l${CSI}?25h${CSI}?1049l`)
    })
  })
})
