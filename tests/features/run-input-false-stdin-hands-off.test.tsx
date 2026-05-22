/**
 * run({ input: false }) MUST keep its hands off the host's stdin.
 *
 * Regression for bead `@km/termless/15541-rec-recording-mode-ux`. The contract
 * is documented in `docs/design/terminal-component.md` § "render({ input:
 * false })" and tested at the Term layer by `render-input-false.test.tsx`.
 * This file pins the same invariant one layer up — at `run()` / `createApp` —
 * where the auto-created Term must inherit `input: false` so it never
 * constructs an InputOwner.
 *
 * The bug: createApp's own input subscription was gated on `inputDisabled`,
 * but its auto-created Term was constructed without forwarding the flag. The
 * provider wiring at create-app.tsx ~3902 reads `term.input` to attach key /
 * mouse / paste subscriptions; that getter lazily constructs an InputOwner,
 * which calls `stdin.setRawMode(true)` + `stdin.setEncoding("utf8")` in its
 * constructor. With encoding flipped to utf8, the host process's own stdin
 * 'data' listener receives strings instead of Buffers — and code like
 * termless `rec`'s `new Uint8Array(chunk)` ends up with empty bytes, so the
 * recorded child PTY never sees keystrokes.
 *
 * Fix lives in create-app.tsx: propagate `input: false` to the auto-created
 * Term when the runtime's `inputDisabled` is true.
 */

import React from "react"
import { EventEmitter } from "node:events"
import { describe, test, expect } from "vitest"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

interface Spy {
  setRawModeCalls: boolean[]
  setEncodingCalls: string[]
  dataListenerCount: number
  readableListenerCount: number
}

function createFakeTtyStdin(): { stream: NodeJS.ReadStream; spy: Spy } {
  const spy: Spy = {
    setRawModeCalls: [],
    setEncodingCalls: [],
    dataListenerCount: 0,
    readableListenerCount: 0,
  }
  const ee = new EventEmitter()
  const overrides = {
    isTTY: true as const,
    isRaw: false,
    fd: 0,
    read(): null {
      return null
    },
    resume(): NodeJS.ReadStream {
      return out
    },
    pause(): NodeJS.ReadStream {
      return out
    },
    ref(): NodeJS.ReadStream {
      return out
    },
    unref(): NodeJS.ReadStream {
      return out
    },
    setRawMode(mode: boolean): NodeJS.ReadStream {
      spy.setRawModeCalls.push(mode)
      overrides.isRaw = mode
      return out
    },
    setEncoding(enc: string): NodeJS.ReadStream {
      spy.setEncodingCalls.push(enc)
      return out
    },
  }
  const out = Object.assign(ee, overrides) as unknown as NodeJS.ReadStream
  // Track listener additions via the EventEmitter "newListener" event.
  ee.on("newListener", (event: string) => {
    if (event === "data") spy.dataListenerCount += 1
    if (event === "readable") spy.readableListenerCount += 1
  })
  return { stream: out, spy }
}

function createFakeTtyStdout(): NodeJS.WriteStream & { written: string[] } {
  const ee = new EventEmitter()
  const written: string[] = []
  const stream = Object.assign(ee, {
    isTTY: true as const,
    columns: 80,
    rows: 24,
    fd: 1,
    written,
    write(data?: string | Uint8Array): true {
      if (data != null) {
        written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      }
      return true
    },
  })
  return stream as unknown as NodeJS.WriteStream & { written: string[] }
}

/** CSI > <flags> u — the Kitty keyboard ENABLE (push) sequence. */
const KITTY_ENABLE_RE = /\x1b\[>\d*u/

describe("run({ input: false }) — stdin hands-off contract", () => {
  test("does not touch stdin (no setRawMode, no setEncoding, no data listener)", async () => {
    const { stream: stdin, spy } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()

    const handle = await run(
      <Box>
        <Text>hi</Text>
      </Box>,
      {
        stdin,
        stdout,
        cols: 80,
        rows: 24,
        input: false,
        mouse: false,
        selection: false,
        focusReporting: false,
      },
    )

    try {
      expect(spy.setRawModeCalls).toEqual([])
      expect(spy.setEncodingCalls).toEqual([])
      expect(spy.dataListenerCount).toBe(0)
      expect(spy.readableListenerCount).toBe(0)
    } finally {
      handle.unmount?.()
    }
  })

  // Regression for `@km/termless/15575-rec-input-broken`.
  //
  // The Kitty keyboard protocol is a *stdin-encoding* mode. When silvery
  // does not own stdin (`input: false` — e.g. termless `rec`'s live
  // overlay), it must not flip the host terminal into Kitty mode: the
  // actual input owner (the recorded child reached through the PTY)
  // negotiates its own keyboard protocol. If silvery enables Kitty behind
  // its back, the host emits CSI-u key reports the child cannot parse —
  // keystrokes leak as raw `[57441;2u` text and every hotkey (incl. Ctrl-D)
  // goes dead. The fix gates the Kitty enable on `!inputDisabled` in
  // create-app.tsx.
  test("does NOT enable the Kitty keyboard protocol on the host", async () => {
    const { stream: stdin } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()

    const handle = await run(
      <Box>
        <Text>hi</Text>
      </Box>,
      {
        stdin,
        stdout,
        cols: 80,
        rows: 24,
        input: false,
        mouse: false,
        selection: false,
        focusReporting: false,
      },
    )

    try {
      const all = stdout.written.join("")
      expect(
        KITTY_ENABLE_RE.test(all),
        `input:false render must not write a Kitty-enable sequence (CSI > … u); ` +
          `got: ${JSON.stringify(all.slice(0, 200))}`,
      ).toBe(false)
    } finally {
      handle.unmount?.()
    }
  })

  // Control: the SAME render WITHOUT `input: false` *does* enable Kitty.
  // This proves the gate is scoped to the input-disabled case and silvery's
  // normal keyboard-protocol setup is intact for apps that own stdin.
  test("control — a normal (input-owning) render DOES enable Kitty", async () => {
    const { stream: stdin } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()

    const handle = await run(
      <Box>
        <Text>hi</Text>
      </Box>,
      {
        stdin,
        stdout,
        cols: 80,
        rows: 24,
        // input not disabled — silvery owns stdin, Kitty enable is correct.
        mouse: false,
        selection: false,
        focusReporting: false,
      },
    )

    try {
      const all = stdout.written.join("")
      expect(KITTY_ENABLE_RE.test(all)).toBe(true)
    } finally {
      handle.unmount?.()
    }
  })
})
