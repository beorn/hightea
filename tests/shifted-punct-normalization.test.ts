/**
 * Verify that legacy terminals normalize shifted punctuation → base key + shift.
 *
 * Legacy terminals send the result character (e.g. `?` for Shift+`/`) without
 * a shift modifier flag. Kitty protocol sends the base codepoint + shift.
 * parseKey() should normalize legacy input so keybindings like `shift-/` match
 * on both protocols.
 */

import { describe, test, expect } from "vitest"
import { parseKey } from "@silvery/ag/keys"

// All US QWERTY shifted punctuation pairs: [shiftedChar, baseChar]
const SHIFTED_PAIRS: [string, string][] = [
  ["!", "1"],
  ["@", "2"],
  ["#", "3"],
  ["$", "4"],
  ["%", "5"],
  ["^", "6"],
  ["&", "7"],
  ["*", "8"],
  ["(", "9"],
  [")", "0"],
  ["_", "-"],
  ["+", "="],
  ["~", "`"],
  ["{", "["],
  ["}", "]"],
  ["|", "\\"],
  [":", ";"],
  ['"', "'"],
  ["<", ","],
  [">", "."],
  ["?", "/"],
]

describe("shifted punctuation normalization", () => {
  describe("legacy terminals: shifted char → base + shift", () => {
    for (const [shifted, base] of SHIFTED_PAIRS) {
      test(`'${shifted}' normalizes to '${base}' + shift`, () => {
        // Legacy terminal sends the shifted character directly
        const [input, key] = parseKey(shifted)
        expect(input).toBe(base)
        expect(key.shift).toBe(true)
      })
    }
  })

  describe("base characters are NOT normalized", () => {
    const BASE_CHARS = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "-",
      "=",
      "`",
      "[",
      "]",
      "\\",
      ";",
      "'",
      ",",
      ".",
      "/",
    ]

    for (const ch of BASE_CHARS) {
      test(`'${ch}' is not shifted`, () => {
        const [input, key] = parseKey(ch)
        expect(input).toBe(ch)
        expect(key.shift).toBe(false)
      })
    }
  })

  describe("Kitty protocol with shifted_codepoint: base key for bindings, shifted text for insertion", () => {
    // Kitty CSI u format with shifted_codepoint: ESC [ codepoint:shifted ; modifiers u
    // modifier 2 = shift
    // input = base key (for keybinding resolution: keyMap.get("/") finds "shift-/")
    // key.text = shifted char (for text insertion: TextInput inserts "?")
    test("Kitty shift+/ with shifted_codepoint: input='/' text='?'", () => {
      const seq = "\x1b[47:63;2u" // codepoint 47='/', shifted 63='?', modifier 2=shift
      const [input, key] = parseKey(seq)
      expect(input).toBe("/")
      expect(key.shift).toBe(true)
      expect(key.text).toBe("?")
    })

    test("Kitty shift+; with shifted_codepoint: input=';' text=':'", () => {
      const seq = "\x1b[59:58;2u" // codepoint 59=';', shifted 58=':', modifier 2=shift
      const [input, key] = parseKey(seq)
      expect(input).toBe(";")
      expect(key.shift).toBe(true)
      expect(key.text).toBe(":")
    })

    test("Kitty shift+1 with shifted_codepoint: input='1' text='!'", () => {
      const seq = "\x1b[49:33;2u" // codepoint 49='1', shifted 33='!', modifier 2=shift
      const [input, key] = parseKey(seq)
      expect(input).toBe("1")
      expect(key.shift).toBe(true)
      expect(key.text).toBe("!")
    })
  })

  describe("Kitty protocol WITHOUT shifted_codepoint: base key for bindings, fallback text", () => {
    // When terminal uses DISAMBIGUATE-only (no REPORT_ALL_KEYS), shifted_codepoint
    // is missing. Silvery uses US QWERTY fallback to recover the shifted character
    // for key.text, but input stays as the base key for keybinding resolution.
    test("Kitty shift+/ without shifted_codepoint: input='/' text='?'", () => {
      const seq = "\x1b[47;2u" // codepoint 47='/', modifier 2=shift, NO shifted_codepoint
      const [input, key] = parseKey(seq)
      expect(input).toBe("/")
      expect(key.shift).toBe(true)
      expect(key.text).toBe("?")
    })

    test("Kitty shift+; without shifted_codepoint: input=';' text=':'", () => {
      const seq = "\x1b[59;2u"
      const [input, key] = parseKey(seq)
      expect(input).toBe(";")
      expect(key.shift).toBe(true)
      expect(key.text).toBe(":")
    })

    test("Kitty shift+1 without shifted_codepoint: input='1' text='!'", () => {
      const seq = "\x1b[49;2u"
      const [input, key] = parseKey(seq)
      expect(input).toBe("1")
      expect(key.shift).toBe(true)
      expect(key.text).toBe("!")
    })
  })

  describe("key.text preserves original character before normalization", () => {
    for (const [shifted, base] of SHIFTED_PAIRS) {
      test(`'${shifted}' has text='${shifted}' even though input='${base}'`, () => {
        const [input, key] = parseKey(shifted)
        expect(input).toBe(base)
        expect(key.text).toBe(shifted)
      })
    }

    test("base characters have text equal to input", () => {
      const [input, key] = parseKey("a")
      expect(input).toBe("a")
      expect(key.text).toBe("a")
    })

    test("uppercase letters preserve text", () => {
      const [input, key] = parseKey("A")
      expect(input).toBe("A")
      expect(key.text).toBe("A")
    })
  })

  describe("Kitty all 21 shifted punct: input=base, text=shifted (with shifted_codepoint)", () => {
    // Exhaustively verify the dual-purpose contract for all US QWERTY shifted punct.
    // Kitty CSI u with shifted_codepoint: ESC [ base:shifted ; 2 u
    for (const [shifted, base] of SHIFTED_PAIRS) {
      const baseCp = base.codePointAt(0)!
      const shiftedCp = shifted.codePointAt(0)!
      test(`Shift+${base} → input='${base}' text='${shifted}'`, () => {
        const seq = `\x1b[${baseCp}:${shiftedCp};2u`
        const [input, key] = parseKey(seq)
        expect(input).toBe(base)
        expect(key.shift).toBe(true)
        expect(key.text).toBe(shifted)
      })
    }
  })

  describe("Kitty all 21 shifted punct: input=base, text=shifted (without shifted_codepoint)", () => {
    // Kitty CSI u without shifted_codepoint: ESC [ base ; 2 u
    // Silvery uses US QWERTY fallback for key.text
    for (const [shifted, base] of SHIFTED_PAIRS) {
      const baseCp = base.codePointAt(0)!
      test(`Shift+${base} → input='${base}' text='${shifted}'`, () => {
        const seq = `\x1b[${baseCp};2u`
        const [input, key] = parseKey(seq)
        expect(input).toBe(base)
        expect(key.shift).toBe(true)
        expect(key.text).toBe(shifted)
      })
    }
  })

  describe("does not affect non-punctuation", () => {
    test("lowercase letters are unaffected", () => {
      const [input, key] = parseKey("a")
      expect(input).toBe("a")
      expect(key.shift).toBe(false)
    })

    test("uppercase letters get shift via existing detection", () => {
      const [input, key] = parseKey("A")
      // Uppercase letters keep the uppercase char and get shift=true
      expect(input).toBe("A")
      expect(key.shift).toBe(true)
    })

    test("space is unaffected", () => {
      const [input, key] = parseKey(" ")
      expect(input).toBe(" ")
      expect(key.shift).toBe(false)
    })
  })
})
