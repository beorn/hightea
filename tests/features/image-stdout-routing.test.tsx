/**
 * Image — StdoutContext.write must route Kitty escapes to the terminal.
 *
 * Regression test for:
 *   `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` —
 *   StdoutContext.Provider used to wire `write: () => {}`, swallowing every
 *   Image escape sequence emitted by the `<Image />` component. silvercode's
 *   welcome banner displayed `[image]` fallback text instead of the PNG
 *   even on Ghostty (which fully supports Kitty graphics). The fix routes
 *   `write` through the Output sub-owner (when available) or through the
 *   real stdout.
 *
 * What we assert: rendering an `<Image protocol="kitty" ...>` through the
 * real `run()` pipeline emits a Kitty graphics APC envelope (`\x1b_G…\x1b\\`)
 * to the terminal's output stream. We capture writes by wrapping the
 * termless-injected stdout, so the assertion is byte-level and robust to
 * whether xterm.js renders Kitty graphics visually.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Image, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { getInternalStreams } from "../../packages/ag-term/src/runtime/term-internal"
import "@termless/test/matchers"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// Minimal valid PNG (1x1 transparent pixel) so encodeKittyImage has real bytes
// to base64-encode. The exact bytes don't matter for routing — only that a
// Kitty APC envelope reaches the output stream.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGIAAQAABQABDQottAAAAABJRU5ErkJggg==",
  "base64",
)

const APC_OPEN = "\x1b_G"
const APC_CLOSE = "\x1b\\"

describe("Image: StdoutContext.write routes escapes to the terminal", () => {
  test("Kitty graphics APC envelope reaches the terminal output", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    // Capture every byte written through the term's internal stdout. The
    // run() Term path passes this stream as createApp's `stdout`, which
    // becomes the destination of StdoutContext.write under our fix
    // (when Output isn't active — termless is headless-ish wrt the guard).
    const writes: string[] = []
    const internal = getInternalStreams(term).stdout as unknown as {
      write: (s: string | Uint8Array) => boolean
    }
    expect(internal, "termless term must expose internal stdout").toBeTruthy()
    const orig = internal.write.bind(internal)
    internal.write = (s: string | Uint8Array) => {
      writes.push(typeof s === "string" ? s : Buffer.from(s).toString("utf8"))
      return orig(s)
    }

    const handle = await run(
      <Box flexDirection="column" padding={1}>
        <Image src={TINY_PNG} width={10} height={5} protocol="kitty" />
      </Box>,
      term,
    )
    // Image writes the escape from useEffect — wait for React to commit
    // and effects to flush, plus a paint cycle.
    await settle(150)

    const all = writes.join("")
    expect(all, "Kitty APC opener should be emitted to the terminal").toContain(APC_OPEN)
    expect(all, "Kitty APC terminator should follow").toContain(APC_CLOSE)
    // Per kitty-graphics encoder: a=T (transmit + place) is the canonical
    // verb the encoder picks for inline transmission with placement.
    expect(all).toMatch(/\x1b_G[^\x1b]*a=[Tt][^\x1b]*\x1b\\/)

    handle.unmount()
  })

  test("Kitty graphics cursor position uses the image slot inside scroll panes", async () => {
    using term = createTermless({ cols: 80, rows: 12 })

    const writes: string[] = []
    const internal = getInternalStreams(term).stdout as unknown as {
      write: (s: string | Uint8Array) => boolean
    }
    const orig = internal.write.bind(internal)
    internal.write = (s: string | Uint8Array) => {
      writes.push(typeof s === "string" ? s : Buffer.from(s).toString("utf8"))
      return orig(s)
    }

    const handle = await run(
      <Box flexDirection="row">
        <Box width={32} flexShrink={0} paddingX={1} paddingY={1}>
          <Text>Stories</Text>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Box flexDirection="column" maxHeight={8} overflow="scroll">
            <Text>Header</Text>
            <Image src={TINY_PNG} width={10} height={4} protocol="kitty" />
          </Box>
        </Box>
      </Box>,
      term,
    )
    await settle(150)

    const all = writes.join("")
    expect(all, "image should emit at row 3, col 34 after the preceding scroll content").toContain(
      "\x1b[3;34H",
    )

    handle.unmount()
  })
})
