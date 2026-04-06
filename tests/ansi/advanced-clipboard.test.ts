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

    // Verify the data chunks reconstruct to original
    const mimeB64 = toBase64("text/plain")
    let reconstructed = ""
    for (let i = 1; i < written.length - 1; i++) {
      const line = written[i]!
      // Extract payload after the semicolon separator
      const prefix = `${ESC}]5522;type=wdata:mime=${mimeB64};`
      expect(line.startsWith(prefix)).toBe(true)
      const payload = line.slice(prefix.length, -ST.length)
      reconstructed += fromBase64(payload)
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

  test("returns null for unterminated sequence", () => {
    expect(parseOsc5522Response(`${ESC}]5522;type=read`)).toBeNull()
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
