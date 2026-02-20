import { describe, expect, test } from "vitest"
import { parseMouseSequence, isMouseSequence, type ParsedMouse } from "../src/mouse.js"
import { splitRawInput } from "../src/keys.js"

// Helper to build SGR mouse sequences
// Format: CSI < button;x;y M/m
// x,y are 1-indexed in the protocol
function sgr(button: number, x: number, y: number, press: boolean): string {
  return `\x1b[<${button};${x};${y}${press ? "M" : "m"}`
}

describe("parseMouseSequence", () => {
  describe("basic button events", () => {
    test("left button press", () => {
      const result = parseMouseSequence(sgr(0, 10, 20, true))!
      expect(result).toMatchObject({
        button: 0,
        x: 9,
        y: 19,
        action: "down",
        shift: false,
        meta: false,
        ctrl: false,
      })
    })

    test("left button release", () => {
      const result = parseMouseSequence(sgr(0, 10, 20, false))!
      expect(result).toMatchObject({
        button: 0,
        x: 9,
        y: 19,
        action: "up",
      })
    })

    test("middle button press", () => {
      const result = parseMouseSequence(sgr(1, 5, 5, true))!
      expect(result.button).toBe(1)
      expect(result.action).toBe("down")
    })

    test("middle button release", () => {
      const result = parseMouseSequence(sgr(1, 5, 5, false))!
      expect(result.button).toBe(1)
      expect(result.action).toBe("up")
    })

    test("right button press", () => {
      const result = parseMouseSequence(sgr(2, 1, 1, true))!
      expect(result.button).toBe(2)
      expect(result.action).toBe("down")
    })

    test("right button release", () => {
      const result = parseMouseSequence(sgr(2, 1, 1, false))!
      expect(result.button).toBe(2)
      expect(result.action).toBe("up")
    })
  })

  describe("coordinate parsing (1-indexed to 0-indexed)", () => {
    test("top-left corner (1,1) becomes (0,0)", () => {
      const result = parseMouseSequence(sgr(0, 1, 1, true))!
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    test("position (50,25) becomes (49,24)", () => {
      const result = parseMouseSequence(sgr(0, 50, 25, true))!
      expect(result.x).toBe(49)
      expect(result.y).toBe(24)
    })

    test("large coordinates for wide terminals", () => {
      const result = parseMouseSequence(sgr(0, 300, 100, true))!
      expect(result.x).toBe(299)
      expect(result.y).toBe(99)
    })
  })

  describe("wheel events", () => {
    test("wheel up (button code 64)", () => {
      const result = parseMouseSequence(sgr(64, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "wheel",
        delta: -1,
        x: 9,
        y: 9,
      })
    })

    test("wheel down (button code 65)", () => {
      const result = parseMouseSequence(sgr(65, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "wheel",
        delta: 1,
      })
    })

    test("wheel with shift (64 + 4 = 68)", () => {
      const result = parseMouseSequence(sgr(68, 10, 10, true))!
      expect(result).toMatchObject({
        action: "wheel",
        delta: -1,
        shift: true,
        meta: false,
        ctrl: false,
      })
    })

    test("wheel with ctrl (65 + 16 = 81)", () => {
      const result = parseMouseSequence(sgr(81, 10, 10, true))!
      expect(result).toMatchObject({
        action: "wheel",
        delta: 1,
        ctrl: true,
      })
    })
  })

  describe("motion events", () => {
    test("move with left button held (32 + 0 = 32)", () => {
      const result = parseMouseSequence(sgr(32, 15, 20, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "move",
        x: 14,
        y: 19,
      })
    })

    test("move with right button held (32 + 2 = 34)", () => {
      const result = parseMouseSequence(sgr(34, 15, 20, true))!
      expect(result).toMatchObject({
        button: 2,
        action: "move",
      })
    })

    test("move with middle button held (32 + 1 = 33)", () => {
      const result = parseMouseSequence(sgr(33, 5, 5, true))!
      expect(result).toMatchObject({
        button: 1,
        action: "move",
      })
    })
  })

  describe("modifier combos", () => {
    test("shift + left click (0 + 4 = 4)", () => {
      const result = parseMouseSequence(sgr(4, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "down",
        shift: true,
        meta: false,
        ctrl: false,
      })
    })

    test("meta/alt + left click (0 + 8 = 8)", () => {
      const result = parseMouseSequence(sgr(8, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "down",
        shift: false,
        meta: true,
        ctrl: false,
      })
    })

    test("ctrl + left click (0 + 16 = 16)", () => {
      const result = parseMouseSequence(sgr(16, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "down",
        shift: false,
        meta: false,
        ctrl: true,
      })
    })

    test("shift + ctrl + right click (2 + 4 + 16 = 22)", () => {
      const result = parseMouseSequence(sgr(22, 10, 10, true))!
      expect(result).toMatchObject({
        button: 2,
        action: "down",
        shift: true,
        meta: false,
        ctrl: true,
      })
    })

    test("all modifiers + middle click (1 + 4 + 8 + 16 = 29)", () => {
      const result = parseMouseSequence(sgr(29, 10, 10, true))!
      expect(result).toMatchObject({
        button: 1,
        action: "down",
        shift: true,
        meta: true,
        ctrl: true,
      })
    })

    test("shift + motion + left (0 + 4 + 32 = 36)", () => {
      const result = parseMouseSequence(sgr(36, 10, 10, true))!
      expect(result).toMatchObject({
        button: 0,
        action: "move",
        shift: true,
      })
    })
  })

  describe("invalid sequences", () => {
    test("empty string", () => {
      expect(parseMouseSequence("")).toBeNull()
    })

    test("regular key", () => {
      expect(parseMouseSequence("a")).toBeNull()
    })

    test("regular CSI sequence (arrow key)", () => {
      expect(parseMouseSequence("\x1b[A")).toBeNull()
    })

    test("incomplete mouse sequence", () => {
      expect(parseMouseSequence("\x1b[<0;10")).toBeNull()
    })

    test("wrong terminator", () => {
      expect(parseMouseSequence("\x1b[<0;10;20X")).toBeNull()
    })

    test("kitty keyboard sequence", () => {
      expect(parseMouseSequence("\x1b[106;9u")).toBeNull()
    })
  })
})

describe("isMouseSequence", () => {
  test("identifies mouse press", () => {
    expect(isMouseSequence(sgr(0, 10, 20, true))).toBe(true)
  })

  test("identifies mouse release", () => {
    expect(isMouseSequence(sgr(0, 10, 20, false))).toBe(true)
  })

  test("identifies wheel event", () => {
    expect(isMouseSequence(sgr(64, 10, 10, true))).toBe(true)
  })

  test("rejects regular key", () => {
    expect(isMouseSequence("a")).toBe(false)
  })

  test("rejects arrow key", () => {
    expect(isMouseSequence("\x1b[A")).toBe(false)
  })

  test("rejects kitty sequence", () => {
    expect(isMouseSequence("\x1b[106;9u")).toBe(false)
  })

  test("rejects partial mouse sequence", () => {
    expect(isMouseSequence("\x1b[<0;10")).toBe(false)
  })
})

describe("splitRawInput integration", () => {
  test("splits mouse sequence from regular keys", () => {
    const input = "a" + sgr(0, 10, 20, true) + "b"
    const parts = [...splitRawInput(input)]
    expect(parts).toEqual(["a", sgr(0, 10, 20, true), "b"])
  })

  test("splits multiple mouse sequences", () => {
    const input = sgr(0, 10, 20, true) + sgr(0, 10, 20, false)
    const parts = [...splitRawInput(input)]
    expect(parts).toEqual([sgr(0, 10, 20, true), sgr(0, 10, 20, false)])
  })

  test("splits mouse sequence from arrow keys", () => {
    const input = "\x1b[A" + sgr(0, 5, 5, true) + "\x1b[B"
    const parts = [...splitRawInput(input)]
    expect(parts).toEqual(["\x1b[A", sgr(0, 5, 5, true), "\x1b[B"])
  })

  test("mouse sequence with large coordinates splits correctly", () => {
    const mouse = sgr(0, 300, 100, true)
    const input = "x" + mouse + "y"
    const parts = [...splitRawInput(input)]
    expect(parts).toEqual(["x", mouse, "y"])
  })

  test("wheel event in mixed input", () => {
    const wheel = sgr(64, 50, 25, true)
    const input = "j" + wheel + "k"
    const parts = [...splitRawInput(input)]
    expect(parts).toEqual(["j", wheel, "k"])
  })

  test("mouse sequence is parseable after split", () => {
    const input = "a" + sgr(2, 42, 17, true) + "b"
    const parts = [...splitRawInput(input)]
    expect(parts).toHaveLength(3)
    const parsed = parseMouseSequence(parts[1]!)!
    expect(parsed).toMatchObject({
      button: 2,
      x: 41,
      y: 16,
      action: "down",
    })
  })
})
