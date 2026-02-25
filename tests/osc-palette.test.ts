/**
 * OSC 4 Palette Color Query/Set Tests
 */

import { describe, expect, test } from "vitest"
import {
  parsePaletteResponse,
  queryMultiplePaletteColors,
  queryPaletteColor,
  setPaletteColor,
} from "../src/osc-palette.js"

/** Capture all writes to a string */
function createCapture(): { write: (data: string) => void; output: () => string } {
  const chunks: string[] = []
  return {
    write: (data: string) => chunks.push(data),
    output: () => chunks.join(""),
  }
}

describe("OSC 4 Palette", () => {
  // ==========================================================================
  // queryPaletteColor
  // ==========================================================================

  describe("queryPaletteColor", () => {
    test("generates correct OSC 4 query for index 0", () => {
      const cap = createCapture()
      queryPaletteColor(0, cap.write)
      expect(cap.output()).toBe("\x1b]4;0;?\x07")
    })

    test("generates correct OSC 4 query for index 255", () => {
      const cap = createCapture()
      queryPaletteColor(255, cap.write)
      expect(cap.output()).toBe("\x1b]4;255;?\x07")
    })

    test("generates correct OSC 4 query for ANSI color 7 (white)", () => {
      const cap = createCapture()
      queryPaletteColor(7, cap.write)
      expect(cap.output()).toBe("\x1b]4;7;?\x07")
    })

    test("throws RangeError for index < 0", () => {
      const cap = createCapture()
      expect(() => queryPaletteColor(-1, cap.write)).toThrow(RangeError)
    })

    test("throws RangeError for index > 255", () => {
      const cap = createCapture()
      expect(() => queryPaletteColor(256, cap.write)).toThrow(RangeError)
    })
  })

  // ==========================================================================
  // queryMultiplePaletteColors
  // ==========================================================================

  describe("queryMultiplePaletteColors", () => {
    test("generates one query per index", () => {
      const cap = createCapture()
      queryMultiplePaletteColors([0, 1, 2], cap.write)
      expect(cap.output()).toBe("\x1b]4;0;?\x07\x1b]4;1;?\x07\x1b]4;2;?\x07")
    })

    test("handles empty array", () => {
      const cap = createCapture()
      queryMultiplePaletteColors([], cap.write)
      expect(cap.output()).toBe("")
    })

    test("generates correct batch for ANSI 16 colors", () => {
      const cap = createCapture()
      const indices = Array.from({ length: 16 }, (_, i) => i)
      queryMultiplePaletteColors(indices, cap.write)
      // Should have 16 separate queries
      const queries = cap.output().split("\x07").filter(Boolean)
      expect(queries).toHaveLength(16)
      expect(queries[0]).toBe("\x1b]4;0;?")
      expect(queries[15]).toBe("\x1b]4;15;?")
    })

    test("throws on invalid index in batch", () => {
      const cap = createCapture()
      expect(() => queryMultiplePaletteColors([0, 300], cap.write)).toThrow(RangeError)
    })
  })

  // ==========================================================================
  // setPaletteColor
  // ==========================================================================

  describe("setPaletteColor", () => {
    test("generates correct OSC 4 set sequence with rgb: format", () => {
      const cap = createCapture()
      setPaletteColor(1, "rgb:ff/00/00", cap.write)
      expect(cap.output()).toBe("\x1b]4;1;rgb:ff/00/00\x07")
    })

    test("generates correct OSC 4 set sequence with hex color", () => {
      const cap = createCapture()
      setPaletteColor(4, "#0000ff", cap.write)
      expect(cap.output()).toBe("\x1b]4;4;#0000ff\x07")
    })

    test("generates correct OSC 4 set sequence with 4-digit hex channels", () => {
      const cap = createCapture()
      setPaletteColor(0, "rgb:ffff/0000/ffff", cap.write)
      expect(cap.output()).toBe("\x1b]4;0;rgb:ffff/0000/ffff\x07")
    })

    test("throws RangeError for index < 0", () => {
      const cap = createCapture()
      expect(() => setPaletteColor(-1, "#ff0000", cap.write)).toThrow(RangeError)
    })

    test("throws RangeError for index > 255", () => {
      const cap = createCapture()
      expect(() => setPaletteColor(256, "#ff0000", cap.write)).toThrow(RangeError)
    })
  })

  // ==========================================================================
  // parsePaletteResponse
  // ==========================================================================

  describe("parsePaletteResponse", () => {
    test("parses standard 4-digit hex response (BEL terminator)", () => {
      const input = "\x1b]4;0;rgb:0000/0000/0000\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 0, color: "#000000" })
    })

    test("parses standard 4-digit hex response (ST terminator)", () => {
      const input = "\x1b]4;0;rgb:0000/0000/0000\x1b\\"
      expect(parsePaletteResponse(input)).toEqual({ index: 0, color: "#000000" })
    })

    test("parses 4-digit hex white", () => {
      const input = "\x1b]4;7;rgb:ffff/ffff/ffff\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 7, color: "#ffffff" })
    })

    test("parses 4-digit hex mixed colors", () => {
      const input = "\x1b]4;1;rgb:cc00/0000/0000\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 1, color: "#cc0000" })
    })

    test("parses 2-digit hex response", () => {
      const input = "\x1b]4;4;rgb:00/00/ff\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 4, color: "#0000ff" })
    })

    test("parses 2-digit hex with ST terminator", () => {
      const input = "\x1b]4;10;rgb:aa/bb/cc\x1b\\"
      expect(parsePaletteResponse(input)).toEqual({ index: 10, color: "#aabbcc" })
    })

    test("parses 1-digit hex (rare)", () => {
      const input = "\x1b]4;0;rgb:0/0/0\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 0, color: "#000000" })
    })

    test("parses 3-digit hex (rare)", () => {
      const input = "\x1b]4;5;rgb:fff/000/abc\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 5, color: "#ff00ab" })
    })

    test("parses high palette index (255)", () => {
      const input = "\x1b]4;255;rgb:ee/ee/ee\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 255, color: "#eeeeee" })
    })

    test("handles response embedded in other data", () => {
      const input = "some noise\x1b]4;3;rgb:00/ff/00\x07more noise"
      expect(parsePaletteResponse(input)).toEqual({ index: 3, color: "#00ff00" })
    })

    test("returns null for non-OSC 4 input", () => {
      expect(parsePaletteResponse("regular text")).toBeNull()
    })

    test("returns null for empty string", () => {
      expect(parsePaletteResponse("")).toBeNull()
    })

    test("returns null for other OSC sequences", () => {
      expect(parsePaletteResponse("\x1b]0;window title\x07")).toBeNull()
    })

    test("returns null for OSC 52 clipboard response", () => {
      expect(parsePaletteResponse("\x1b]52;c;aGVsbG8=\x07")).toBeNull()
    })

    test("returns null for query sequence (not a response)", () => {
      // The query itself should not be parsed as a valid response
      expect(parsePaletteResponse("\x1b]4;0;?\x07")).toBeNull()
    })

    test("returns null for malformed rgb body", () => {
      expect(parsePaletteResponse("\x1b]4;0;rgb:gg/00/00\x07")).toBeNull()
    })

    test("returns null for missing terminator", () => {
      expect(parsePaletteResponse("\x1b]4;0;rgb:ff/00/00")).toBeNull()
    })

    test("returns null for missing rgb: prefix", () => {
      expect(parsePaletteResponse("\x1b]4;0;ff/00/00\x07")).toBeNull()
    })

    test("returns null for index > 255 in response", () => {
      expect(parsePaletteResponse("\x1b]4;256;rgb:ff/00/00\x07")).toBeNull()
    })

    test("case-insensitive hex parsing", () => {
      const input = "\x1b]4;1;rgb:AA/BB/CC\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 1, color: "#AABBCC" })
    })

    test("mixed case 4-digit hex", () => {
      const input = "\x1b]4;2;rgb:aAbB/cCdD/eEfF\x07"
      expect(parsePaletteResponse(input)).toEqual({ index: 2, color: "#aAcCeE" })
    })
  })
})
