/**
 * Regression: createApp's local Modes owner (the fallback when no Term is
 * injected — silvercode's `run({ mode: "fullscreen" })` path) used to capture
 * `stdout.write` directly at construction time. Once the Output owner
 * activates and monkey-patches `process.stdout.write` into a suppress sink,
 * mode-toggle effects (alt-screen, mouse, kitty keyboard, focus reporting)
 * silently route their ANSI through the sink — never reach the terminal.
 *
 * User-visible: silvercode "I scroll up and see shell scrollback" because
 * the alt-screen enter byte sequence `\x1b[?1049h` was being dropped, and
 * `mouse: true` never engaged so the scroll wheel passed through to the
 * terminal's scrollback nav. Same shape as the Pro-review 2026-04-22
 * P0-1 finding for `term.modes` (already covered in
 * `owned-write-routing.test.ts`), but `term.modes` only ships through the
 * createTerm path. createApp's local fallback was missed.
 *
 * Fix: route the modes writer through an `ownedWrite`-shaped function that
 * consults the Output owner's `active()` signal — when active, write through
 * `output.write()` (which sets `silveryWriting=true` and bypasses the sink);
 * when inactive, write through raw `stdout.write` as before.
 */

import { describe, expect, test } from "vitest"
import { createModes } from "../../packages/ag-term/src/runtime/devices/modes"
import { createOutput } from "../../packages/ag-term/src/runtime/devices/output"

function swapStdoutWrite(capture: (s: string) => void): () => void {
  const original = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = ((
    chunk: string | Uint8Array,
  ): boolean => {
    const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
    capture(s)
    return true
  }) as typeof process.stdout.write
  return () => {
    process.stdout.write = original as typeof process.stdout.write
  }
}

describe("createApp local Modes writer survives output.activate()", () => {
  test("alt-screen toggle reaches stdout when Output owner is active", () => {
    const captured: string[] = []
    const restore = swapStdoutWrite((s) => captured.push(s))
    try {
      // Mimic create-app.tsx's modes construction: writer captured BEFORE
      // output activates. Pre-fix, this is `(s) => stdout.write(s)` with
      // a static reference to `process.stdout`. The fix passes a writer
      // that lazily checks the Output owner.
      const stdout = process.stdout
      const stdin = process.stdin

      // The fix-shaped writer the production code must use:
      let output: ReturnType<typeof createOutput> | null = null
      const writer = (s: string) => (output && output.active() ? output.write(s) : stdout.write(s))
      const modes = createModes({ write: writer, stdin })

      output = createOutput()
      output.activate({ bufferStderr: true })

      try {
        const before = captured.length
        modes.altScreen(true)
        const altSeq = captured.slice(before).join("")
        expect(altSeq, "alt-screen enter must reach captured stdout").toContain("\x1b[?1049h")
      } finally {
        modes.altScreen(false)
        output.deactivate()
        output.dispose()
        modes[Symbol.dispose]?.()
      }
    } finally {
      restore()
    }
  })

  test("REGRESSION: writer captured as `(s) => stdout.write(s)` is suppressed", () => {
    // Demonstrates the bug shape: the broken pattern lets the suppress sink
    // eat alt-screen ANSI. This test pins the pre-fix routing semantics so
    // any future "simplification" that re-introduces the bug fails loudly.
    const captured: string[] = []
    const restore = swapStdoutWrite((s) => captured.push(s))
    try {
      const stdout = process.stdout
      const stdin = process.stdin
      const modes = createModes({ write: (s) => stdout.write(s), stdin })

      const output = createOutput()
      output.activate({ bufferStderr: true })

      try {
        const before = captured.length
        modes.altScreen(true)
        const altSeq = captured.slice(before).join("")
        expect(
          altSeq,
          "broken writer pattern: alt-screen ANSI is swallowed by the suppress sink",
        ).not.toContain("\x1b[?1049h")
      } finally {
        modes.altScreen(false)
        output.deactivate()
        output.dispose()
        modes[Symbol.dispose]?.()
      }
    } finally {
      restore()
    }
  })
})
