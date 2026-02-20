/**
 * Tests for mouse event wiring in runtime layers.
 */

import { EventEmitter } from "events"
import { describe, expect, it } from "vitest"
import { enableMouse, disableMouse } from "../src/output.js"
import { isMouseSequence, parseMouseSequence } from "../src/mouse.js"
import { createTermProvider } from "../src/runtime/term-provider.js"

// ============================================================================
// Mouse protocol output sequences
// ============================================================================

describe("Mouse protocol output sequences", () => {
  it("enableMouse sends correct mode sequences", () => {
    const seq = enableMouse()
    // Should enable X10, button events, and SGR
    expect(seq).toContain("\x1b[?1000h") // X10 mouse reporting
    expect(seq).toContain("\x1b[?1002h") // Button-event tracking
    expect(seq).toContain("\x1b[?1006h") // SGR extended mouse mode
  })

  it("disableMouse sends correct mode sequences", () => {
    const seq = disableMouse()
    // Should disable in reverse order
    expect(seq).toContain("\x1b[?1006l")
    expect(seq).toContain("\x1b[?1002l")
    expect(seq).toContain("\x1b[?1000l")
  })
})

// ============================================================================
// Mouse sequence detection and parsing
// ============================================================================

describe("Mouse sequence in input pipeline", () => {
  it("isMouseSequence identifies SGR sequences", () => {
    // Left button press at (10, 20)
    expect(isMouseSequence("\x1b[<0;10;20M")).toBe(true)
    // Left button release
    expect(isMouseSequence("\x1b[<0;10;20m")).toBe(true)
    // Right button press
    expect(isMouseSequence("\x1b[<2;5;10M")).toBe(true)
    // Wheel up
    expect(isMouseSequence("\x1b[<64;5;10M")).toBe(true)
  })

  it("isMouseSequence rejects non-mouse sequences", () => {
    expect(isMouseSequence("\x1b[A")).toBe(false) // Arrow up
    expect(isMouseSequence("j")).toBe(false) // Plain key
    expect(isMouseSequence("\x1b[1;9u")).toBe(false) // Kitty key
  })

  it("parseMouseSequence extracts correct data", () => {
    const result = parseMouseSequence("\x1b[<0;10;20M")
    expect(result).toEqual({
      button: 0,
      x: 9, // 0-indexed
      y: 19, // 0-indexed
      action: "down",
      shift: false,
      meta: false,
      ctrl: false,
    })
  })

  it("parseMouseSequence handles release", () => {
    const result = parseMouseSequence("\x1b[<0;10;20m")
    expect(result).toEqual({
      button: 0,
      x: 9,
      y: 19,
      action: "up",
      shift: false,
      meta: false,
      ctrl: false,
    })
  })

  it("parseMouseSequence handles wheel events", () => {
    // Wheel up
    const up = parseMouseSequence("\x1b[<64;5;10M")
    expect(up).toMatchObject({
      action: "wheel",
      delta: -1,
    })

    // Wheel down
    const down = parseMouseSequence("\x1b[<65;5;10M")
    expect(down).toMatchObject({
      action: "wheel",
      delta: 1,
    })
  })

  it("parseMouseSequence handles modifier keys", () => {
    // Shift + left click: button 0 + 4 (shift) = 4
    const shifted = parseMouseSequence("\x1b[<4;10;20M")
    expect(shifted).toMatchObject({
      button: 0,
      shift: true,
      meta: false,
      ctrl: false,
    })

    // Ctrl + left click: button 0 + 16 (ctrl) = 16
    const ctrl = parseMouseSequence("\x1b[<16;10;20M")
    expect(ctrl).toMatchObject({
      button: 0,
      shift: false,
      meta: false,
      ctrl: true,
    })

    // Alt + left click: button 0 + 8 (alt) = 8
    const alt = parseMouseSequence("\x1b[<8;10;20M")
    expect(alt).toMatchObject({
      button: 0,
      shift: false,
      meta: true,
      ctrl: false,
    })
  })

  it("parseMouseSequence handles motion events", () => {
    // Motion with left button: button 0 + 32 (motion) = 32
    const motion = parseMouseSequence("\x1b[<32;10;20M")
    expect(motion).toMatchObject({
      button: 0,
      action: "move",
    })
  })
})

// ============================================================================
// Term provider mouse event routing
// ============================================================================

function createMockStreams() {
  const stdin = new EventEmitter() as NodeJS.ReadStream & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    resume: () => void
    pause: () => void
    setEncoding: (enc: string) => void
  }
  stdin.isTTY = true
  stdin.setRawMode = () => {}
  stdin.resume = () => {}
  stdin.pause = () => {}
  stdin.setEncoding = () => {}

  const stdout = new EventEmitter() as NodeJS.WriteStream & {
    columns: number
    rows: number
  }
  stdout.columns = 80
  stdout.rows = 24

  return { stdin, stdout }
}

describe("Term provider mouse events", () => {
  it("routes mouse sequences as mouse events", async () => {
    const { stdin, stdout } = createMockStreams()
    const term = createTermProvider(stdin, stdout)

    const events: any[] = []
    const iter = term.events()

    // Start consuming events in background
    const consumer = (async () => {
      for await (const event of iter) {
        events.push(event)
        if (events.length >= 1) break
      }
    })()

    // Wait for event loop to start
    await new Promise((r) => setTimeout(r, 10))

    // Simulate mouse input
    stdin.emit("data", "\x1b[<0;10;20M")

    await consumer

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("mouse")
    expect(events[0].data).toMatchObject({
      button: 0,
      x: 9,
      y: 19,
      action: "down",
    })

    term[Symbol.dispose]()
  })

  it("routes key sequences as key events", async () => {
    const { stdin, stdout } = createMockStreams()
    const term = createTermProvider(stdin, stdout)

    const events: any[] = []
    const iter = term.events()

    const consumer = (async () => {
      for await (const event of iter) {
        events.push(event)
        if (events.length >= 1) break
      }
    })()

    await new Promise((r) => setTimeout(r, 10))

    // Simulate key input
    stdin.emit("data", "j")

    await consumer

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("key")
    expect(events[0].data.input).toBe("j")

    term[Symbol.dispose]()
  })

  it("handles mixed key and mouse input in same chunk", async () => {
    const { stdin, stdout } = createMockStreams()
    const term = createTermProvider(stdin, stdout)

    const events: any[] = []
    const iter = term.events()

    const consumer = (async () => {
      for await (const event of iter) {
        events.push(event)
        if (events.length >= 2) break
      }
    })()

    await new Promise((r) => setTimeout(r, 10))

    // Mixed: key 'j' followed by mouse click
    // These come as separate chunks in splitRawInput since CSI is a separator
    stdin.emit("data", "j\x1b[<0;10;20M")

    await consumer

    expect(events).toHaveLength(2)
    expect(events[0].type).toBe("key")
    expect(events[0].data.input).toBe("j")
    expect(events[1].type).toBe("mouse")
    expect(events[1].data).toMatchObject({
      button: 0,
      x: 9,
      y: 19,
      action: "down",
    })

    term[Symbol.dispose]()
  })
})

// ============================================================================
// RunOptions/AppRunOptions type checks
// ============================================================================

describe("Mouse option in RunOptions", () => {
  it("mouse option is accepted", () => {
    const opts: import("../src/runtime/run.js").RunOptions = {
      mouse: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.mouse).toBe(true)
  })
})

describe("Mouse option in AppRunOptions", () => {
  it("mouse option is accepted", () => {
    const opts: import("../src/runtime/create-app.js").AppRunOptions = {
      mouse: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.mouse).toBe(true)
  })
})
