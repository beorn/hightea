import { describe, expect, it } from "vitest"
import { detectKittySupport, type KittyDetectResult } from "../src/kitty-detect.js"

function mockWrite(): { written: string[]; write: (s: string) => void } {
  const written: string[] = []
  return { written, write: (s: string) => written.push(s) }
}

function mockRead(response: string | null, delayMs = 0): (ms: number) => Promise<string | null> {
  return (_timeoutMs: number) =>
    new Promise((resolve) => {
      if (response == null) {
        setTimeout(() => resolve(null), delayMs || _timeoutMs)
      } else {
        setTimeout(() => resolve(response), delayMs)
      }
    })
}

describe("detectKittySupport", () => {
  it("detects support when terminal responds with CSI ? 1 u", async () => {
    const { written, write } = mockWrite()
    const result = await detectKittySupport(write, mockRead("\x1b[?1u"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(1)
    expect(result.buffered).toBeUndefined()
    expect(written).toEqual(["\x1b[?u"])
  })

  it("detects support with flags=31 (all flags)", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("\x1b[?31u"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(31)
  })

  it("detects support with flags=0", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("\x1b[?0u"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(0)
  })

  it("returns unsupported on timeout (null response)", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead(null), 10)

    expect(result.supported).toBe(false)
    expect(result.flags).toBe(0)
    expect(result.buffered).toBeUndefined()
  })

  it("returns unsupported on garbage response", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("garbage data"))

    expect(result.supported).toBe(false)
    expect(result.flags).toBe(0)
    expect(result.buffered).toBe("garbage data")
  })

  it("preserves buffered input before the response", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("hello\x1b[?3u"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(3)
    expect(result.buffered).toBe("hello")
  })

  it("preserves buffered input after the response", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("\x1b[?1uextra"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(1)
    expect(result.buffered).toBe("extra")
  })

  it("preserves buffered input on both sides of the response", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead("before\x1b[?7uafter"))

    expect(result.supported).toBe(true)
    expect(result.flags).toBe(7)
    expect(result.buffered).toBe("beforeafter")
  })

  it("multiple sequential calls are safe", async () => {
    const { write } = mockWrite()
    const results: KittyDetectResult[] = []

    results.push(await detectKittySupport(write, mockRead("\x1b[?1u")))
    results.push(await detectKittySupport(write, mockRead(null), 10))
    results.push(await detectKittySupport(write, mockRead("\x1b[?15u")))

    expect(results[0]!.supported).toBe(true)
    expect(results[0]!.flags).toBe(1)
    expect(results[1]!.supported).toBe(false)
    expect(results[2]!.supported).toBe(true)
    expect(results[2]!.flags).toBe(15)
  })

  it("handles empty string response as unsupported", async () => {
    const result = await detectKittySupport(mockWrite().write, mockRead(""))

    expect(result.supported).toBe(false)
    expect(result.flags).toBe(0)
    // empty string is falsy so buffered should be present but empty
    expect(result.buffered).toBe("")
  })
})
