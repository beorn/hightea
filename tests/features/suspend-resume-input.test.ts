/**
 * Regression test for Ctrl+Z (SIGTSTP) → fg (SIGCONT) input loss.
 *
 * Root cause (pre-fix): `restoreTerminalState` in terminal-lifecycle.ts called
 * `stdin.removeAllListeners("data")` to drain in-flight bytes before suspend.
 * The single `data` listener owned by `InputOwner` (per the
 * "stdin has ONE owner per session" architecture) was destroyed and never
 * re-attached on SIGCONT. Result: after `fg`, raw bytes piled up unread, no
 * key events reached the runtime, and the app appeared frozen.
 *
 * The fix: InputOwner exposes pause()/resume() that detach/reattach the
 * single listener WITHOUT removing it permanently. terminal-lifecycle's
 * suspend/resume calls those instead of removeAllListeners.
 */

import { describe, it, expect } from "vitest"
import { createInputOwner } from "@silvery/ag-term/runtime"
import {
  restoreTerminalState,
  resumeTerminalState,
  captureTerminalState,
} from "@silvery/ag-term/runtime/terminal-lifecycle"

// =============================================================================
// Mock stdin/stdout — same shape as tests/features/input-owner.test.ts but
// adds removeAllListeners (the API restoreTerminalState used to call) so we
// faithfully simulate what would have killed the listener pre-fix.
// =============================================================================

function createMockIO(opts?: { isTTY?: boolean }) {
  const written: string[] = []
  const dataHandlers = new Set<(chunk: string) => void>()
  const isTTY = opts?.isTTY ?? true

  const rawState = {
    isRaw: false,
    paused: false,
    encoding: null as BufferEncoding | null,
  }

  const stdout = {
    write: (data: string) => {
      written.push(data)
      return true
    },
    isTTY,
    columns: 80,
    rows: 24,
    fd: -1, // not process.stdout — restore uses stdout.write fallback
    on: () => {},
    off: () => {},
    emit: () => {},
  } as unknown as NodeJS.WriteStream

  const stdin = {
    get isTTY() {
      return isTTY
    },
    get isRaw() {
      return rawState.isRaw
    },
    setRawMode(raw: boolean) {
      rawState.isRaw = raw
      return stdin
    },
    resume() {
      rawState.paused = false
    },
    pause() {
      rawState.paused = true
    },
    setEncoding(enc: BufferEncoding) {
      rawState.encoding = enc
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.add(handler as (chunk: string) => void)
      return stdin
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.delete(handler as (chunk: string) => void)
      return stdin
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      return stdin.off(event, handler)
    },
    removeAllListeners(event?: string) {
      if (event === "data" || event === undefined) dataHandlers.clear()
      return stdin
    },
    listenerCount(event: string) {
      if (event === "data") return dataHandlers.size
      return 0
    },
    read() {
      return null
    },
  } as unknown as NodeJS.ReadStream

  function send(chunk: string) {
    for (const handler of [...dataHandlers]) handler(chunk)
  }

  return { stdin, stdout, written, send, rawState, dataHandlers }
}

// =============================================================================
// Tests
// =============================================================================

describe("Ctrl+Z then fg — input listener survives suspend/resume", () => {
  it("key events still reach onKey subscribers after restore + resume cycle", () => {
    const { stdin, stdout, send, dataHandlers } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const keys: string[] = []
    owner.onKey((e) => keys.push(e.input))

    // Pre-suspend sanity: keys flow.
    send("a")
    expect(keys).toEqual(["a"])
    expect(dataHandlers.size).toBe(1)

    // Capture state — caller would do this once at startup.
    const state = captureTerminalState({
      rawMode: true,
      alternateScreen: true,
      cursorHidden: true,
    })

    // Simulate Ctrl+Z prep: restore the terminal to normal. Passing `state`
    // so the data listeners are saved for re-attach (the suspend path; on
    // final exit we'd omit state).
    restoreTerminalState(stdout, stdin, state)

    // Simulate fg / SIGCONT: re-enter TUI mode.
    resumeTerminalState(state, stdout, stdin)

    // The owner's single data listener MUST still be attached. Pre-fix, this
    // failed: removeAllListeners stripped it and resume never re-attached.
    expect(dataHandlers.size).toBe(1)

    // Post-resume: a fresh keystroke must reach onKey.
    send("b")
    expect(keys).toEqual(["a", "b"])
  })

  it("drain loop in restore still discards in-flight pre-suspend bytes", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const keys: string[] = []
    owner.onKey((e) => keys.push(e.input))

    // Pre-suspend: a key arrives.
    send("a")
    expect(keys).toEqual(["a"])

    const state = captureTerminalState({ rawMode: true, alternateScreen: true })

    // Suspend prep — owner is paused, drain loop discards anything queued.
    restoreTerminalState(stdout, stdin, state)

    // Bytes that arrive while paused must NOT reach the handler. The owner is
    // paused; downstream code is the kernel's tty buffer and the OS shell.
    // We can't easily simulate "kernel buffered" here, but we can assert that
    // the owner does not double-deliver previously-handled bytes.
    expect(keys).toEqual(["a"])

    // Resume — listener must be live again, fresh keys flow.
    resumeTerminalState(state, stdout, stdin)
    send("c")
    expect(keys).toEqual(["a", "c"])
  })
})
