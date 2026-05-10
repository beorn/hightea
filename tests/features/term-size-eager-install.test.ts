/**
 * createTerm — eager SIGWINCH install.
 *
 * `createSize()` installs the `stdout.on("resize")` listener lazily on first
 * read of any size signal. This is fine for cold Terms constructed during
 * startup orchestration, but a live Term whose React tree drives layout via
 * `Box.onLayout` (e.g. silvercode) never reads `term.size.*` and therefore
 * never installs the listener — SIGWINCH events are dropped and the binary
 * does not repaint on terminal resize.
 *
 * The fix in `createTerm()` (ansi/term.ts) calls `size.snapshot()` once at
 * construction time to force the install for every live Node Term, regardless
 * of whether downstream React code subscribes to the signal.
 */

import EventEmitter from "node:events"
import { describe, test, expect } from "vitest"
import { createTerm } from "../../packages/ag-term/src/ansi/term"

function createMockStdout(cols = 80, rows = 24): NodeJS.WriteStream {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  ;(stdout as unknown as { isTTY: boolean }).isTTY = true
  ;(stdout as unknown as { write: (s: string) => boolean }).write = () => true
  return stdout
}

function createMockStdin(): NodeJS.ReadStream {
  const stdin = {
    isTTY: false,
    on: () => stdin,
    off: () => stdin,
    removeListener: () => stdin,
    listenerCount: () => 0,
  } as unknown as NodeJS.ReadStream
  return stdin
}

describe("createTerm — SIGWINCH eager install", () => {
  test("installs stdout.on('resize') listener at construction time, not lazily", () => {
    const stdout = createMockStdout(132, 40)
    const stdin = createMockStdin()
    expect(stdout.listenerCount("resize")).toBe(0)
    const term = createTerm({ stdin, stdout })
    // After construction, the size sub-owner must have force-read snapshot()
    // → ensureInstalled() ran → exactly one resize listener attached. Without
    // the fix, this count would be 0 because nothing in createTerm reads
    // size.cols / size.rows / size.snapshot lazily.
    expect(stdout.listenerCount("resize")).toBe(1)
    // Sanity: the signal returns the live dims (not stale defaults).
    expect(term.size.cols()).toBe(132)
    expect(term.size.rows()).toBe(40)
  })

  test("SIGWINCH after construction is observed without any prior signal read", async () => {
    const stdout = createMockStdout(80, 24)
    const stdin = createMockStdin()
    const term = createTerm({ stdin, stdout })
    // Simulate a SIGWINCH burst — the listener is installed eagerly so the
    // resize is captured even though no consumer has read size.* yet. After
    // the trailing-edge debounce window, snapshot() reflects the new dims.
    ;(stdout as unknown as { columns: number }).columns = 132
    ;(stdout as unknown as { rows: number }).rows = 40
    stdout.emit("resize")
    await new Promise<void>((r) => setTimeout(r, 250)) // > RESIZE_COALESCE_MS (200)
    expect(term.size.cols()).toBe(132)
    expect(term.size.rows()).toBe(40)
  })
})
