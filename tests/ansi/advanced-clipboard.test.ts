/**
 * Advanced Clipboard (OSC 5522) tests.
 *
 * Covers:
 * - copyText generates correct OSC 5522 with text/plain MIME
 * - copyRich generates entries for both text/plain and text/html
 * - Large payload chunking works correctly
 * - Paste event parsing
 * - Falls back to OSC 52 when 5522 not supported
 * - Response parsing
 * - dispose cleanup
 */

import { describe, test, expect, vi } from "vitest"
import {
  createAdvancedClipboard,
  parseOsc5522Response,
  parsePasteData,
  ENABLE_PASTE_EVENTS,
  DISABLE_PASTE_EVENTS,
  type ClipboardEntry,
  type AdvancedClipboard,
} from "../../packages/ag-term/src/ansi/advanced-clipboard"

// ============================================================================
// Helpers
// ============================================================================

const ESC = "\x1b"
const ST = `${ESC}\\`

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64")
}

function fromBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8")
}

/** Create a mock write function that captures all written data */
function createMockWrite() {
  const written: string[] = []
  const write = vi.fn((data: string) => {
    written.push(data)
  })
  return { write, written }
}

/** Create an advanced clipboard with mock I/O */
function createTestClipboard(opts: { supported?: boolean; chunkSize?: number } = {}) {
  const { write, written } = createMockWrite()
  const dataHandlers: Array<(data: string) => void> = []

  const clipboard = createAdvancedClipboard({
    write,
    onData: (handler) => {
      dataHandlers.push(handler)
      return () => {
        const idx = dataHandlers.indexOf(handler)
        if (idx >= 0) dataHandlers.splice(idx, 1)
      }
    },
    supported: opts.supported ?? false,
    chunkSize: opts.chunkSize,
  })

  /** Simulate terminal sending data to the app */
  function simulateInput(data: string): void {
    for (const handler of dataHandlers) {
      handler(data)
    }
  }

  return { clipboard, write, written, simulateInput, dataHandlers }
}

// ============================================================================
// OSC 52 Fallback (supported = false)
// ============================================================================

describe("OSC 52 fallback (supported=false)", () => {
  test("copyText sends OSC 52 sequence", () => {
    const { clipboard, written } = createTestClipboard({ supported: false })

    clipboard.copyText("Hello World")

    expect(written).toHaveLength(1)
    const output = written[0]!
    // Should be OSC 52 format: ESC ] 52 ; c ; <base64> BEL
    expect(output).toMatch(/^\x1b\]52;c;[A-Za-z0-9+/=]+\x07$/)

    // Decode the base64 payload
    const base64 = output.slice(7, -1) // strip ESC]52;c; and BEL
    expect(fromBase64(base64)).toBe("Hello World")
  })

  test("copyRich sends only text/plain via OSC 52", () => {
    const { clipboard, written } = createTestClipboard({ supported: false })

    clipboard.copyRich("Hello", "<b>Hello</b>")

    // Should send one OSC 52 with just the plain text
    expect(written).toHaveLength(1)
    const base64 = written[0]!.slice(7, -1)
    expect(fromBase64(base64)).toBe("Hello")
  })

  test("copy with no text/plain entry produces no output", () => {
    const { clipboard, written } = createTestClipboard({ supported: false })

    clipboard.copy([{ mime: "text/html", data: "<b>Hello</b>" }])

    expect(written).toHaveLength(0)
  })

  test("supported returns false", () => {
    const { clipboard } = createTestClipboard({ supported: false })
    expect(clipboard.supported).toBe(false)
  })
})

// ============================================================================
// OSC 5522 Protocol (supported = true)
// ============================================================================

describe("OSC 5522 write protocol", () => {
  test("copyText sends write start, wdata chunk, and wdata end", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    clipboard.copyText("Hello")

    // Expect: 1 write start + 1 wdata chunk + 1 wdata end = 3
    expect(written).toHaveLength(3)

    // 1. Write start
    expect(written[0]).toBe(`${ESC}]5522;type=write${ST}`)

    // 2. wdata chunk with mime and payload
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("Hello")
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${mimeB64};${dataB64}${ST}`)

    // 3. wdata end (no payload, no mime)
    expect(written[2]).toBe(`${ESC}]5522;type=wdata${ST}`)
  })

  test("copyRich sends both text/plain and text/html entries", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    clipboard.copyRich("Hello", "<b>Hello</b>")

    // 1 write start + 1 text/plain chunk + 1 text/plain end
    //                + 1 text/html chunk + 1 text/html end = 5
    expect(written).toHaveLength(5)

    // Verify write start
    expect(written[0]).toBe(`${ESC}]5522;type=write${ST}`)

    // Verify text/plain entry
    const textMimeB64 = toBase64("text/plain")
    const textDataB64 = toBase64("Hello")
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${textMimeB64};${textDataB64}${ST}`)
    expect(written[2]).toBe(`${ESC}]5522;type=wdata${ST}`)

    // Verify text/html entry
    const htmlMimeB64 = toBase64("text/html")
    const htmlDataB64 = toBase64("<b>Hello</b>")
    expect(written[3]).toBe(`${ESC}]5522;type=wdata:mime=${htmlMimeB64};${htmlDataB64}${ST}`)
    expect(written[4]).toBe(`${ESC}]5522;type=wdata${ST}`)
  })

  test("copy with binary data (Uint8Array)", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })
    const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes

    clipboard.copy([{ mime: "image/png", data: pngData }])

    // write start + 1 chunk + end = 3
    expect(written).toHaveLength(3)

    // Extract and verify the payload
    const mimeB64 = toBase64("image/png")
    const dataB64 = Buffer.from(pngData).toString("base64")
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${mimeB64};${dataB64}${ST}`)
  })

  test("supported returns true", () => {
    const { clipboard } = createTestClipboard({ supported: true })
    expect(clipboard.supported).toBe(true)
  })
})

// ============================================================================
// Large Payload Chunking
// ============================================================================

describe("chunking", () => {
  test("data larger than chunkSize is split into multiple chunks", () => {
    const chunkSize = 8 // tiny chunk size for testing
    const { clipboard, written } = createTestClipboard({ supported: true, chunkSize })

    // Create data larger than chunk size (20 bytes > 8)
    const text = "A".repeat(20)
    clipboard.copyText(text)

    // write start + ceil(20/8)=3 data chunks + 1 end = 5
    expect(written).toHaveLength(5)

    // Verify write start
    expect(written[0]).toBe(`${ESC}]5522;type=write${ST}`)

    // Verify the data chunks reconstruct to original. With multi-chunk
    // payloads each non-final chunk carries `m=1` in its metadata, so we
    // accept either prefix shape and just grab the base64 payload via the
    // public response parser.
    const mimeB64 = toBase64("text/plain")
    let reconstructed = ""
    for (let i = 1; i < written.length - 1; i++) {
      const parsed = parseOsc5522Response(written[i]!)
      expect(parsed).not.toBeNull()
      expect(parsed!.type).toBe("wdata")
      expect(parsed!.mime).toBe(mimeB64)
      expect(parsed!.payload).toBeDefined()
      reconstructed += fromBase64(parsed!.payload!)
    }
    expect(reconstructed).toBe(text)

    // Verify end marker
    expect(written[written.length - 1]).toBe(`${ESC}]5522;type=wdata${ST}`)
  })

  test("data exactly equal to chunkSize produces one chunk", () => {
    const chunkSize = 10
    const { clipboard, written } = createTestClipboard({ supported: true, chunkSize })

    clipboard.copyText("A".repeat(10))

    // write start + 1 data chunk + 1 end = 3
    expect(written).toHaveLength(3)
  })

  test("empty data still sends a chunk and end marker", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    clipboard.copyText("")

    // write start + 1 empty chunk + 1 end = 3
    expect(written).toHaveLength(3)

    const mimeB64 = toBase64("text/plain")
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${mimeB64};${ST}`)
  })

  test("default chunk size is 4096", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    // Data that's exactly 4096 bytes should produce 1 chunk
    const text = "A".repeat(4096)
    clipboard.copyText(text)

    // write start + 1 chunk + end = 3
    expect(written).toHaveLength(3)
  })

  test("data at 4097 bytes produces 2 chunks with default size", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    // 4097 bytes = 2 chunks (4096 + 1)
    const text = "A".repeat(4097)
    clipboard.copyText(text)

    // write start + 2 chunks + end = 4
    expect(written).toHaveLength(4)
  })

  // --------------------------------------------------------------------------
  // Kitty multi-chunk DCS continuation flag (m=1)
  // --------------------------------------------------------------------------
  // Per kitty's clipboard protocol, when wdata is split across multiple OSC
  // sequences for a single MIME entry, every chunk EXCEPT the last carries
  // m=1 in its metadata; the final data chunk carries m=0 (or omits m).
  // The trailing empty wdata still signals end-of-data for the MIME type.
  // See https://sw.kovidgoyal.net/kitty/clipboard/

  test("multi-chunk payload emits m=1 on every non-final chunk", () => {
    const chunkSize = 8
    const { clipboard, written } = createTestClipboard({ supported: true, chunkSize })

    // 20 bytes → ceil(20/8) = 3 data chunks
    const text = "A".repeat(20)
    clipboard.copyText(text)

    // write start + 3 data chunks + 1 end = 5
    expect(written).toHaveLength(5)

    const mimeB64 = toBase64("text/plain")

    // First two data chunks (indices 1 and 2) MUST carry m=1
    expect(written[1]).toContain(`type=wdata:m=1:mime=${mimeB64}`)
    expect(written[2]).toContain(`type=wdata:m=1:mime=${mimeB64}`)

    // Final data chunk (index 3) MUST carry m=0 (or omit m)
    expect(written[3]).toContain(`type=wdata:m=0:mime=${mimeB64}`)
    expect(written[3]).not.toContain("m=1")

    // End marker (index 4) is the empty-wdata terminator (unchanged)
    expect(written[4]).toBe(`${ESC}]5522;type=wdata${ST}`)
  })

  test("single-chunk payload does NOT emit m=1 (back-compat)", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    // Default 4096-byte chunk; small payload → single chunk
    clipboard.copyText("Hello")

    // write start + 1 data chunk + 1 end = 3
    expect(written).toHaveLength(3)

    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("Hello")

    // Single-chunk happy path: metadata is `type=wdata:mime=...` (no m= flag)
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${mimeB64};${dataB64}${ST}`)
    expect(written[1]).not.toContain("m=1")
    expect(written[1]).not.toContain("m=0")
  })

  test("empty payload still emits a single chunk without m= (back-compat)", () => {
    const { clipboard, written } = createTestClipboard({ supported: true })

    clipboard.copyText("")

    expect(written).toHaveLength(3)
    const mimeB64 = toBase64("text/plain")
    expect(written[1]).toBe(`${ESC}]5522;type=wdata:mime=${mimeB64};${ST}`)
    expect(written[1]).not.toContain("m=")
  })

  test("two-chunk payload: first chunk m=1, second m=0", () => {
    const chunkSize = 10
    const { clipboard, written } = createTestClipboard({ supported: true, chunkSize })

    // 15 bytes → 2 chunks (10 + 5)
    clipboard.copyText("B".repeat(15))

    // write start + 2 data chunks + 1 end = 4
    expect(written).toHaveLength(4)

    const mimeB64 = toBase64("text/plain")
    expect(written[1]).toContain(`type=wdata:m=1:mime=${mimeB64}`)
    expect(written[2]).toContain(`type=wdata:m=0:mime=${mimeB64}`)
  })

  test("10MB payload: encode → decode roundtrip via parseOsc5522Response", () => {
    // Tests the bead's headline acceptance: 10MB clipboard data round-trips
    // correctly through generateChunks + parseOsc5522Response. We reconstruct
    // by concatenating the base64 payloads from every non-terminator wdata
    // chunk; m= flag tells us which chunks are mid-stream vs final.

    const chunkSize = 4096 // default
    const { clipboard, written } = createTestClipboard({ supported: true, chunkSize })

    // 10 MB of varied content (not a single repeated byte — exercises base64
    // boundary alignment and reassembly correctness on non-trivial data).
    const size = 10 * 1024 * 1024
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      // Deterministic pseudo-random pattern. Keep within 7-bit ASCII so we
      // can compare as a Buffer round-trip without unicode normalization.
      bytes[i] = (i * 2654435761) & 0x7f
    }
    const expectedBuf = Buffer.from(bytes)

    clipboard.copy([{ mime: "application/octet-stream", data: bytes }])

    const expectedChunks = Math.ceil(size / chunkSize)
    // write start + expectedChunks data chunks + 1 end marker
    expect(written).toHaveLength(1 + expectedChunks + 1)
    expect(written[0]).toBe(`${ESC}]5522;type=write${ST}`)

    // Walk every data chunk (skip start at index 0 and end at last index),
    // parse it with the public response parser, reassemble, and verify.
    const reassembled: Buffer[] = []
    let sawFinalFlag = false
    for (let i = 1; i < written.length - 1; i++) {
      const parsed = parseOsc5522Response(written[i]!)
      expect(parsed).not.toBeNull()
      expect(parsed!.type).toBe("wdata")
      expect(parsed!.payload).toBeDefined()

      // Non-final chunks: m=1. Final data chunk: m=0 (or absent).
      const raw = written[i]!
      const isLast = i === written.length - 2
      if (isLast) {
        expect(raw).toContain("m=0")
        expect(raw).not.toContain("m=1")
        sawFinalFlag = true
      } else {
        expect(raw).toContain("m=1")
      }

      reassembled.push(Buffer.from(parsed!.payload!, "base64"))
    }
    expect(sawFinalFlag).toBe(true)

    const actual = Buffer.concat(reassembled)
    expect(actual.length).toBe(expectedBuf.length)
    expect(actual.equals(expectedBuf)).toBe(true)

    // Trailing terminator: empty wdata, no payload
    expect(written[written.length - 1]).toBe(`${ESC}]5522;type=wdata${ST}`)
  })
})

// ============================================================================
// Response Parsing
// ============================================================================

describe("parseOsc5522Response", () => {
  test("parses read DATA response with mime and payload", () => {
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("Hello")
    const input = `${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`

    const result = parseOsc5522Response(input)

    expect(result).toEqual({
      type: "read",
      status: "DATA",
      mime: mimeB64,
      payload: dataB64,
    })
  })

  test("parses read DONE response (no payload)", () => {
    const input = `${ESC}]5522;type=read:status=DONE${ST}`

    const result = parseOsc5522Response(input)

    expect(result).toEqual({
      type: "read",
      status: "DONE",
    })
  })

  test("parses write DONE response", () => {
    const input = `${ESC}]5522;type=write:status=DONE${ST}`

    const result = parseOsc5522Response(input)

    expect(result).toEqual({
      type: "write",
      status: "DONE",
    })
  })

  test("parses error response", () => {
    const input = `${ESC}]5522;type=read:status=EPERM${ST}`

    const result = parseOsc5522Response(input)

    expect(result).toEqual({
      type: "read",
      status: "EPERM",
    })
  })

  test("returns null for non-5522 input", () => {
    expect(parseOsc5522Response("random text")).toBeNull()
  })

  test("throws ProtocolError for unterminated sequence", () => {
    // OSC 5522 prefix present (we committed to this protocol) but no ST
    // terminator. The parser must fail loudly so the dispatch boundary
    // surfaces the malformed terminal output.
    // See @km/silvery/15127-custom-protocol-implementation/protocol-loud-errors.
    expect(() => parseOsc5522Response(`${ESC}]5522;type=read`)).toThrow(/terminator|ST/i)
  })

  test("handles 5522 prefix embedded in larger input", () => {
    const input = `garbage${ESC}]5522;type=read:status=DONE${ST}more`
    const result = parseOsc5522Response(input)

    expect(result).toEqual({
      type: "read",
      status: "DONE",
    })
  })
})

// ============================================================================
// Paste Data Parsing
// ============================================================================

describe("parsePasteData", () => {
  test("parses text/plain paste data", () => {
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("Pasted text")
    const input = `${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`

    const result = parsePasteData(input)

    expect(result).toEqual({
      mime: "text/plain",
      data: "Pasted text",
    })
  })

  test("parses text/html paste data as string", () => {
    const mimeB64 = toBase64("text/html")
    const dataB64 = toBase64("<b>bold</b>")
    const input = `${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`

    const result = parsePasteData(input)

    expect(result).toEqual({
      mime: "text/html",
      data: "<b>bold</b>",
    })
  })

  test("parses binary data (image/png) as Uint8Array", () => {
    const mimeB64 = toBase64("image/png")
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const dataB64 = Buffer.from(pngBytes).toString("base64")
    const input = `${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`

    const result = parsePasteData(input)

    expect(result).not.toBeNull()
    expect(result!.mime).toBe("image/png")
    expect(result!.data).toBeInstanceOf(Uint8Array)
    expect(result!.data).toEqual(pngBytes)
  })

  test("returns null for non-DATA responses", () => {
    const input = `${ESC}]5522;type=read:status=DONE${ST}`
    expect(parsePasteData(input)).toBeNull()
  })

  test("returns null for write responses", () => {
    const input = `${ESC}]5522;type=write:status=DONE${ST}`
    expect(parsePasteData(input)).toBeNull()
  })

  test("returns null for garbage input", () => {
    expect(parsePasteData("not an osc sequence")).toBeNull()
  })
})

// ============================================================================
// Paste Events (onPaste)
// ============================================================================

describe("onPaste", () => {
  test("receives paste entries when terminal sends DATA + DONE", () => {
    const { clipboard, simulateInput } = createTestClipboard({ supported: true })
    const received: ClipboardEntry[][] = []

    clipboard.onPaste((entries) => received.push(entries))

    // Simulate terminal sending paste data
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("pasted content")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`)
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(1)
    expect(received[0]![0]!.mime).toBe("text/plain")
    expect(received[0]![0]!.data).toBe("pasted content")
  })

  test("accumulates multiple MIME entries before DONE", () => {
    const { clipboard, simulateInput } = createTestClipboard({ supported: true })
    const received: ClipboardEntry[][] = []

    clipboard.onPaste((entries) => received.push(entries))

    // Send text/plain
    const textMime = toBase64("text/plain")
    const textData = toBase64("Hello")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${textMime};${textData}${ST}`)

    // Send text/html
    const htmlMime = toBase64("text/html")
    const htmlData = toBase64("<b>Hello</b>")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${htmlMime};${htmlData}${ST}`)

    // DONE
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(2)
    expect(received[0]![0]!.mime).toBe("text/plain")
    expect(received[0]![1]!.mime).toBe("text/html")
  })

  test("unsubscribe stops receiving events", () => {
    const { clipboard, simulateInput } = createTestClipboard({ supported: true })
    const received: ClipboardEntry[][] = []

    const unsub = clipboard.onPaste((entries) => received.push(entries))

    // Send one paste
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("first")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`)
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(1)

    // Unsubscribe
    unsub()

    // Send another paste — should not be received
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`)
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(1)
  })

  test("DONE without preceding DATA does not fire handler", () => {
    const { clipboard, simulateInput } = createTestClipboard({ supported: true })
    const received: ClipboardEntry[][] = []

    clipboard.onPaste((entries) => received.push(entries))

    // Just DONE, no DATA
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(0)
  })

  test("multiple handlers all receive paste events", () => {
    const { clipboard, simulateInput } = createTestClipboard({ supported: true })
    const received1: ClipboardEntry[][] = []
    const received2: ClipboardEntry[][] = []

    clipboard.onPaste((entries) => received1.push(entries))
    clipboard.onPaste((entries) => received2.push(entries))

    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("for both")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`)
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received1).toHaveLength(1)
    expect(received2).toHaveLength(1)
  })
})

// ============================================================================
// Dispose
// ============================================================================

describe("dispose", () => {
  test("clears paste handlers and unsubscribes from input", () => {
    const { clipboard, simulateInput, dataHandlers } = createTestClipboard({ supported: true })
    const received: ClipboardEntry[][] = []

    clipboard.onPaste((entries) => received.push(entries))
    expect(dataHandlers).toHaveLength(1)

    clipboard.dispose()
    expect(dataHandlers).toHaveLength(0)

    // Paste events should not fire after dispose
    const mimeB64 = toBase64("text/plain")
    const dataB64 = toBase64("too late")
    simulateInput(`${ESC}]5522;type=read:status=DATA:mime=${mimeB64};${dataB64}${ST}`)
    simulateInput(`${ESC}]5522;type=read:status=DONE${ST}`)

    expect(received).toHaveLength(0)
  })
})

// ============================================================================
// Paste Event Constants
// ============================================================================

describe("constants", () => {
  test("ENABLE_PASTE_EVENTS is correct CSI sequence", () => {
    expect(ENABLE_PASTE_EVENTS).toBe(`${ESC}[?5522h`)
  })

  test("DISABLE_PASTE_EVENTS is correct CSI sequence", () => {
    expect(DISABLE_PASTE_EVENTS).toBe(`${ESC}[?5522l`)
  })
})
