/**
 * SGR-Pixels (CSI 1016) mouse parser coverage — 15127 GAP 2.
 *
 * Sibling file to `sgr-pixels-mouse.test.ts`, which covers the
 * advertise-mode wiring + a sanity press / move / synthetic-event path.
 *
 * This file expands parser coverage for the SGR-Pixels CSI 1016 wire shape:
 *   - terminator semantics (`M` press / `m` release) under pixel mode
 *   - wheel encoding (raw=64/65/66/67) under pixel mode
 *   - modifier flags (shift / meta / ctrl) under pixel mode
 *   - motion (raw & 32) under pixel mode
 *   - pixel→cell conversion across two common cell sizes (8×16, 10×20)
 *   - cellSize edge cases (zero / negative → clamps to 1; omitted → 1×1)
 *   - `isMouseSequence` shape detection
 *
 * Parser is `parseMouseSequence` in `@silvery/ag-term/mouse`. The wire
 * form is `CSI < button;x;y M|m` where x/y are 1-indexed and (under
 * mode 1016) are physical pixel coordinates rather than cell columns.
 * The parser converts to 0-indexed internally and (in pixel mode)
 * divides by the configured cell size to produce silvery layout
 * coordinates in fractional cells.
 */
import { describe, expect, test } from "vitest"
import { parseMouseSequence, isMouseSequence } from "@silvery/ag-term/mouse"

describe("parseMouseSequence — SGR-Pixels (CSI 1016) coverage", () => {
  describe("terminator semantics under pixel mode", () => {
    test("`M` terminator with no motion bit is a press (action=down)", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "down",
        button: 0,
        x: 12.5,
        y: 8.75,
        clientX: 100,
        clientY: 140,
        coordinateMode: "pixel",
      })
    })

    test("`m` terminator (lowercase) with no motion bit is a release (action=up)", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141m", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "up",
        button: 0,
        x: 12.5,
        y: 8.75,
        clientX: 100,
        clientY: 140,
        coordinateMode: "pixel",
      })
    })

    test("motion bit (raw & 32) wins over terminator — `M` + motion = move, not down", () => {
      // raw = 32 (motion) → button = 32 & 3 = 0; action = "move"
      const parsed = parseMouseSequence("\x1b[<32;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({ action: "move", button: 0 })
    })

    test("right-button drag (raw=34=32|2) parses as move with button=2", () => {
      const parsed = parseMouseSequence("\x1b[<34;81;161M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "move",
        button: 2,
        x: 10,
        y: 10,
        clientX: 80,
        clientY: 160,
      })
    })
  })

  describe("wheel encoding under pixel mode", () => {
    test("wheel up (raw=64) parses as wheel with delta=-1", () => {
      const parsed = parseMouseSequence("\x1b[<64;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "wheel",
        delta: -1,
        button: 0,
        coordinateMode: "pixel",
      })
    })

    test("wheel down (raw=65) parses as wheel with delta=+1", () => {
      const parsed = parseMouseSequence("\x1b[<65;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({ action: "wheel", delta: 1 })
    })

    test("wheel left (raw=66) parses as wheel with delta=+1", () => {
      // Parser flattens horizontal-vs-vertical into a single delta sign:
      // only raw & 3 == 0 (= wheel-up) is -1; the other three directions
      // are +1. We pin the current behavior so unrelated refactors don't
      // silently invert one of these axes.
      const parsed = parseMouseSequence("\x1b[<66;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({ action: "wheel", delta: 1 })
    })

    test("wheel right (raw=67) parses as wheel with delta=+1", () => {
      const parsed = parseMouseSequence("\x1b[<67;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({ action: "wheel", delta: 1 })
    })

    test("wheel events still carry pixel client coordinates and fractional layout coords", () => {
      const parsed = parseMouseSequence("\x1b[<64;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        x: 12.5,
        y: 8.75,
        clientX: 100,
        clientY: 140,
      })
    })
  })

  describe("modifier flags under pixel mode", () => {
    test("shift bit (raw=4) sets shift=true, leaves meta/ctrl false", () => {
      const parsed = parseMouseSequence("\x1b[<4;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "down",
        button: 0,
        shift: true,
        meta: false,
        ctrl: false,
      })
    })

    test("meta/alt bit (raw=8) sets meta=true, leaves shift/ctrl false", () => {
      const parsed = parseMouseSequence("\x1b[<8;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "down",
        button: 0,
        shift: false,
        meta: true,
        ctrl: false,
      })
    })

    test("ctrl bit (raw=16) sets ctrl=true, leaves shift/meta false", () => {
      const parsed = parseMouseSequence("\x1b[<16;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "down",
        button: 0,
        shift: false,
        meta: false,
        ctrl: true,
      })
    })

    test("all three modifiers together (raw=28=4|8|16) compose", () => {
      const parsed = parseMouseSequence("\x1b[<28;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "down",
        button: 0,
        shift: true,
        meta: true,
        ctrl: true,
      })
    })

    test("modifiers + motion = move with modifiers preserved", () => {
      // raw = 36 = 32 (motion) | 4 (shift)
      const parsed = parseMouseSequence("\x1b[<36;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "move",
        button: 0,
        shift: true,
        meta: false,
        ctrl: false,
      })
    })

    test("modifiers + wheel = wheel with modifiers preserved", () => {
      // raw = 68 = 64 (wheel-up) | 4 (shift)
      const parsed = parseMouseSequence("\x1b[<68;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        action: "wheel",
        delta: -1,
        shift: true,
        meta: false,
        ctrl: false,
      })
    })
  })

  describe("pixel → cell conversion across common cell sizes", () => {
    test("8×16 cell, click at top-left pixel (1,1) lands at cell (0,0)", () => {
      // SGR sends 1-indexed; parser subtracts → rawX=rawY=0 → x=y=0.
      const parsed = parseMouseSequence("\x1b[<0;1;1M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        x: 0,
        y: 0,
        clientX: 0,
        clientY: 0,
      })
    })

    test("8×16 cell, integer cell boundary (px 8,16) lands at cell (1,1)", () => {
      // 1-indexed pixel 9,17 → rawX=8 / 8 = 1.0, rawY=16 / 16 = 1.0
      const parsed = parseMouseSequence("\x1b[<0;9;17M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        x: 1,
        y: 1,
        clientX: 8,
        clientY: 16,
      })
    })

    test("8×16 cell, fractional position (px 100,140) → cell (12.5, 8.75)", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        x: 12.5,
        y: 8.75,
        clientX: 100,
        clientY: 140,
      })
    })

    test("10×20 cell, integer cell boundary (px 10,20) lands at cell (1,1)", () => {
      const parsed = parseMouseSequence("\x1b[<0;11;21M", {
        coordinateMode: "pixel",
        cellSize: { width: 10, height: 20 },
      })
      expect(parsed).toMatchObject({
        x: 1,
        y: 1,
        clientX: 10,
        clientY: 20,
      })
    })

    test("10×20 cell, fractional position (px 105,150) → cell (10.5, 7.5)", () => {
      const parsed = parseMouseSequence("\x1b[<0;106;151M", {
        coordinateMode: "pixel",
        cellSize: { width: 10, height: 20 },
      })
      expect(parsed).toMatchObject({
        x: 10.5,
        y: 7.5,
        clientX: 105,
        clientY: 150,
      })
    })

    test("10×20 cell, fractional sub-cell (px 5,10) → cell (0.5, 0.5)", () => {
      const parsed = parseMouseSequence("\x1b[<0;6;11M", {
        coordinateMode: "pixel",
        cellSize: { width: 10, height: 20 },
      })
      expect(parsed).toMatchObject({
        x: 0.5,
        y: 0.5,
        clientX: 5,
        clientY: 10,
      })
    })

    test("layout x/y is always rawPixel / cellSize — same SGR bytes, different cell sizes give different x/y", () => {
      const wire = "\x1b[<0;81;161M" // 1-indexed px → rawX=80, rawY=160
      const small = parseMouseSequence(wire, {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
      })
      const large = parseMouseSequence(wire, {
        coordinateMode: "pixel",
        cellSize: { width: 10, height: 20 },
      })

      // Same physical pixel; different layout coords by cell size ratio.
      expect(small).toMatchObject({ x: 10, y: 10, clientX: 80, clientY: 160 })
      expect(large).toMatchObject({ x: 8, y: 8, clientX: 80, clientY: 160 })
    })
  })

  describe("pixel-mode cellSize edge cases", () => {
    test("cellSize omitted defaults to 1×1 — pixel coords ARE layout coords", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
      })
      expect(parsed).toMatchObject({
        x: 100,
        y: 140,
        clientX: 100,
        clientY: 140,
      })
    })

    test("cellSize.width = 0 clamps to 1 (avoids NaN / Infinity)", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 0, height: 16 },
      })
      expect(parsed).not.toBeNull()
      expect(Number.isFinite(parsed!.x)).toBe(true)
      // width clamped to 1 → x = rawX / 1 = 100
      expect(parsed!.x).toBe(100)
      // height unaffected
      expect(parsed!.y).toBe(140 / 16)
    })

    test("cellSize.height = 0 clamps to 1 (avoids NaN / Infinity)", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 0 },
      })
      expect(parsed).not.toBeNull()
      expect(Number.isFinite(parsed!.y)).toBe(true)
      expect(parsed!.y).toBe(140)
      expect(parsed!.x).toBe(100 / 8)
    })

    test("negative cellSize clamps to 1 — no negative-coordinate flip", () => {
      const parsed = parseMouseSequence("\x1b[<0;101;141M", {
        coordinateMode: "pixel",
        cellSize: { width: -8, height: -16 },
      })
      expect(parsed).not.toBeNull()
      expect(parsed!.x).toBe(100)
      expect(parsed!.y).toBe(140)
      // clientX/Y always the raw 0-indexed pixel — sign-stable
      expect(parsed!.clientX).toBe(100)
      expect(parsed!.clientY).toBe(140)
    })
  })

  describe("cell-mode regression — pixel options must not contaminate cell parse", () => {
    test("cell-mode parse with cellSize argument still returns integer cell coords and NO clientX/clientY", () => {
      // Even if a misconfigured caller passes cellSize while leaving
      // coordinateMode in its default "cell", we must NOT treat the
      // SGR x/y as pixels and produce fractional coords. cellSize is
      // a pixel-mode concept; cell-mode should ignore it.
      const parsed = parseMouseSequence("\x1b[<0;13;9M", {
        cellSize: { width: 8, height: 16 },
      })
      expect(parsed).toMatchObject({
        x: 12,
        y: 8,
        coordinateMode: "cell",
        action: "down",
        button: 0,
      })
      expect(parsed).not.toHaveProperty("clientX")
      expect(parsed).not.toHaveProperty("clientY")
    })

    test("explicit coordinateMode='cell' behaves identically to default", () => {
      const parsed = parseMouseSequence("\x1b[<0;13;9M", {
        coordinateMode: "cell",
      })
      expect(parsed).toMatchObject({ x: 12, y: 8, coordinateMode: "cell" })
      expect(parsed).not.toHaveProperty("clientX")
      expect(parsed).not.toHaveProperty("clientY")
    })
  })

  describe("isMouseSequence shape detection", () => {
    test("recognises an SGR press", () => {
      expect(isMouseSequence("\x1b[<0;13;9M")).toBe(true)
    })

    test("recognises an SGR release", () => {
      expect(isMouseSequence("\x1b[<0;13;9m")).toBe(true)
    })

    test("recognises a SGR-Pixels-style large coordinate sequence", () => {
      expect(isMouseSequence("\x1b[<0;1024;768M")).toBe(true)
    })

    test("rejects non-mouse CSI sequences", () => {
      expect(isMouseSequence("\x1b[10;20H")).toBe(false) // cursor position
      expect(isMouseSequence("\x1b[?1003h")).toBe(false) // mouse mode enable
      expect(isMouseSequence("\x1b[<0;13;9M\x1b[<0;14;9M")).toBe(false) // chained
    })

    test("rejects empty / non-escape inputs", () => {
      expect(isMouseSequence("")).toBe(false)
      expect(isMouseSequence("M")).toBe(false)
      expect(isMouseSequence("0;13;9M")).toBe(false)
    })
  })

  describe("parseMouseSequence — invalid input", () => {
    test("returns null for an empty string", () => {
      expect(parseMouseSequence("")).toBeNull()
    })

    test("returns null for a cursor-position sequence", () => {
      expect(parseMouseSequence("\x1b[10;20H")).toBeNull()
    })

    test("returns null for a mouse-mode enable sequence", () => {
      expect(parseMouseSequence("\x1b[?1003h")).toBeNull()
    })

    test("returns null for a sequence missing the final M/m", () => {
      expect(parseMouseSequence("\x1b[<0;13;9")).toBeNull()
    })
  })
})
