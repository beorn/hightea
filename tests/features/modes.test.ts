/**
 * Unit tests for term.modes — the single-owner terminal protocol mode setter.
 *
 * Covers: raw, alt-screen, bracketed paste, kitty keyboard, mouse, focus
 * reporting. Each setter is idempotent, tracks last-written state, and
 * dispose() restores exactly what the owner activated (no global reset).
 */

import { describe, it, expect } from "vitest"
import { createModes, KittyFlags } from "@silvery/ag-term/runtime"

// =============================================================================
// Mock stdin (only the bits setRawMode touches)
// =============================================================================

function createMockStdin(opts?: { isTTY?: boolean }) {
  const isTTY = opts?.isTTY ?? true
  const state = { isRaw: false, setRawCalls: 0 }
  const stdin = {
    get isTTY() {
      return isTTY
    },
    get isRaw() {
      return state.isRaw
    },
    setRawMode(raw: boolean) {
      state.setRawCalls++
      state.isRaw = raw
      return stdin
    },
  } as unknown as NodeJS.ReadStream
  return { stdin, state }
}

function createRecordingWrite() {
  const writes: string[] = []
  const write = (data: string) => {
    writes.push(data)
  }
  return { write, writes, joined: () => writes.join("") }
}

// =============================================================================
// Tests
// =============================================================================

describe("createModes — construction", () => {
  it("does not emit any ANSI or termios change until a setter is called", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    expect(writes).toHaveLength(0)
    expect(state.setRawCalls).toBe(0)
    expect(modes.isRawMode).toBe(false)
    expect(modes.isAlternateScreen).toBe(false)
    expect(modes.isBracketedPaste).toBe(false)
    expect(modes.kittyKeyboard).toBe(false)
    expect(modes.isMouseEnabled).toBe(false)
    expect(modes.isFocusReporting).toBe(false)
  })
})

describe("createModes — setRawMode", () => {
  it("toggles stdin raw state and tracks it", () => {
    const { stdin, state } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setRawMode(true)
    expect(state.isRaw).toBe(true)
    expect(modes.isRawMode).toBe(true)
    expect(state.setRawCalls).toBe(1)

    modes.setRawMode(true) // idempotent — no second call to stdin.setRawMode
    expect(state.setRawCalls).toBe(1)
  })

  it("no-ops on non-TTY stdin but still tracks tendency", () => {
    const { stdin, state } = createMockStdin({ isTTY: false })
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setRawMode(true)
    // non-TTY: setRawMode on the stream isn't called, but our state tracks intent
    expect(state.setRawCalls).toBe(0)
    expect(modes.isRawMode).toBe(true)
  })
})

describe("createModes — setAlternateScreen", () => {
  it("emits 1049h on enable and 1049l on disable, idempotent", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setAlternateScreen(true)
    expect(modes.isAlternateScreen).toBe(true)
    expect(writes).toContain("\x1b[?1049h")

    const before = writes.length
    modes.setAlternateScreen(true) // idempotent
    expect(writes.length).toBe(before)

    modes.setAlternateScreen(false)
    expect(modes.isAlternateScreen).toBe(false)
    expect(writes.at(-1)).toBe("\x1b[?1049l")
  })
})

describe("createModes — setBracketedPaste", () => {
  it("emits 2004h / 2004l", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setBracketedPaste(true)
    expect(writes).toContain("\x1b[?2004h")
    expect(modes.isBracketedPaste).toBe(true)

    modes.setBracketedPaste(false)
    expect(writes.at(-1)).toBe("\x1b[?2004l")
    expect(modes.isBracketedPaste).toBe(false)
  })
})

describe("createModes — setKittyKeyboard", () => {
  it("emits CSI > flags u on enable, CSI < u on disable", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const flags = KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS
    modes.setKittyKeyboard(flags)
    expect(writes).toContain(`\x1b[>${flags}u`)
    expect(modes.kittyKeyboard).toBe(flags)

    modes.setKittyKeyboard(false)
    expect(writes.at(-1)).toBe("\x1b[<u")
    expect(modes.kittyKeyboard).toBe(false)
  })

  it("treats repeat-same-flags call as idempotent", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setKittyKeyboard(11)
    const count = writes.length
    modes.setKittyKeyboard(11)
    expect(writes.length).toBe(count)
  })
})

describe("createModes — setMouseEnabled", () => {
  it("emits SGR mouse enable (1003+1006) / disable (1006l+1003l)", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setMouseEnabled(true)
    // canonical sequence from @silvery/ansi: ?1003h + ?1006h
    expect(writes.at(-1)).toBe("\x1b[?1003h\x1b[?1006h")
    expect(modes.isMouseEnabled).toBe(true)

    modes.setMouseEnabled(false)
    expect(writes.at(-1)).toBe("\x1b[?1006l\x1b[?1003l")
    expect(modes.isMouseEnabled).toBe(false)
  })
})

describe("createModes — setFocusReporting", () => {
  it("emits 1004h / 1004l", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setFocusReporting(true)
    expect(writes.at(-1)).toBe("\x1b[?1004h")
    expect(modes.isFocusReporting).toBe(true)

    modes.setFocusReporting(false)
    expect(writes.at(-1)).toBe("\x1b[?1004l")
    expect(modes.isFocusReporting).toBe(false)
  })
})

describe("createModes — dispose", () => {
  it("restores ONLY modes that were activated, in correct order", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setRawMode(true)
    modes.setAlternateScreen(true)
    modes.setBracketedPaste(true)
    modes.setKittyKeyboard(1)
    modes.setMouseEnabled(true)
    modes.setFocusReporting(true)

    writes.length = 0 // clear so we only see dispose output
    modes[Symbol.dispose]()

    const output = writes.join("")
    // Order: focus → mouse → kitty → paste → alt-screen
    expect(output.indexOf("\x1b[?1004l")).toBeGreaterThanOrEqual(0)
    expect(output.indexOf("\x1b[?1006l\x1b[?1003l")).toBeGreaterThan(output.indexOf("\x1b[?1004l"))
    expect(output.indexOf("\x1b[<u")).toBeGreaterThan(output.indexOf("\x1b[?1006l\x1b[?1003l"))
    expect(output.indexOf("\x1b[?2004l")).toBeGreaterThan(output.indexOf("\x1b[<u"))
    expect(output.indexOf("\x1b[?1049l")).toBeGreaterThan(output.indexOf("\x1b[?2004l"))

    // Raw mode restored via termios, not ANSI
    expect(state.isRaw).toBe(false)

    // State cleared
    expect(modes.isRawMode).toBe(false)
    expect(modes.isAlternateScreen).toBe(false)
    expect(modes.isBracketedPaste).toBe(false)
    expect(modes.kittyKeyboard).toBe(false)
    expect(modes.isMouseEnabled).toBe(false)
    expect(modes.isFocusReporting).toBe(false)
  })

  it("does nothing on dispose if nothing was activated", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes[Symbol.dispose]()
    expect(writes).toHaveLength(0)
    expect(state.setRawCalls).toBe(0)
  })

  it("ignores setters after dispose (no leak)", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes[Symbol.dispose]()
    writes.length = 0

    modes.setRawMode(true)
    modes.setAlternateScreen(true)
    modes.setMouseEnabled(true)
    expect(writes).toHaveLength(0)
    expect(modes.isRawMode).toBe(false)
    expect(modes.isAlternateScreen).toBe(false)
    expect(modes.isMouseEnabled).toBe(false)
  })

  it("is idempotent — second dispose is a no-op", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.setBracketedPaste(true)
    modes[Symbol.dispose]()
    const after = writes.length
    modes[Symbol.dispose]()
    expect(writes.length).toBe(after)
  })
})
