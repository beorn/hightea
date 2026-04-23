import { describe, it, expect, vi } from "vitest"
import {
  createWidthDetector,
  createWidthMeasurer,
  DEFAULT_WIDTH_CONFIG,
  WidthMode,
  applyWidthConfig,
  type TerminalWidthConfig,
  type WidthDetectorOptions,
} from "@silvery/ag-term"

/**
 * Build a DECRPM response: CSI ? {mode} ; {ps} $ y
 */
function decrpm(mode: number, ps: number): string {
  return `\x1b[?${mode};${ps}$y`
}

/**
 * Create a mock terminal that responds to DECRQM queries.
 * The `responses` map controls what each mode returns.
 */
function createMockTerminal(responses: Map<number, number> = new Map()) {
  const handlers: Array<(data: string) => void> = []
  const written: string[] = []

  const write = (data: string) => {
    written.push(data)
    // Parse the DECRQM query and auto-respond
    const match = data.match(/\x1b\[\?(\d+)\$p/)
    if (match) {
      const mode = parseInt(match[1]!, 10)
      const ps = responses.get(mode)
      if (ps !== undefined) {
        // Deliver response asynchronously (like a real terminal)
        setTimeout(() => {
          for (const handler of handlers) {
            handler(decrpm(mode, ps))
          }
        }, 1)
      }
    }
  }

  const onData = (handler: (data: string) => void) => {
    handlers.push(handler)
    return () => {
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
    }
  }

  return { write, onData, written, handlers }
}

describe("createWidthDetector", () => {
  it("parses all 4 mode responses correctly", async () => {
    const responses = new Map([
      [WidthMode.UTF8, 1], // set (UTF-8 enabled)
      [WidthMode.CJK_WIDTH, 1], // set (wide)
      [WidthMode.EMOJI_WIDTH, 1], // set (wide)
      [WidthMode.PRIVATE_USE_WIDTH, 2], // reset (narrow)
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const config = await detector.detect()
    expect(config).toEqual({
      utf8: true,
      cjkWidth: 2,
      emojiWidth: 2,
      privateUseWidth: 1,
    } satisfies TerminalWidthConfig)

    detector.dispose()
  })

  it("handles all-reset responses (narrow widths)", async () => {
    const responses = new Map([
      [WidthMode.UTF8, 2], // reset
      [WidthMode.CJK_WIDTH, 2], // reset (narrow)
      [WidthMode.EMOJI_WIDTH, 2], // reset (narrow)
      [WidthMode.PRIVATE_USE_WIDTH, 2], // reset (narrow)
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const config = await detector.detect()
    expect(config).toEqual({
      utf8: false,
      cjkWidth: 1,
      emojiWidth: 1,
      privateUseWidth: 1,
    } satisfies TerminalWidthConfig)

    detector.dispose()
  })

  it("handles permanently set/reset modes (ps=3,4)", async () => {
    const responses = new Map([
      [WidthMode.UTF8, 3], // permanently set
      [WidthMode.CJK_WIDTH, 4], // permanently reset
      [WidthMode.EMOJI_WIDTH, 3], // permanently set
      [WidthMode.PRIVATE_USE_WIDTH, 4], // permanently reset
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const config = await detector.detect()
    expect(config).toEqual({
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 2,
      privateUseWidth: 1,
    } satisfies TerminalWidthConfig)

    detector.dispose()
  })

  it("falls back to defaults on timeout", async () => {
    // Terminal that never responds
    const terminal = createMockTerminal(new Map())
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 50, // Short timeout for test speed
    })

    const config = await detector.detect()
    expect(config).toEqual(DEFAULT_WIDTH_CONFIG)

    detector.dispose()
  })

  it("caches result and returns same config on repeated calls", async () => {
    const responses = new Map([
      [WidthMode.UTF8, 1],
      [WidthMode.CJK_WIDTH, 1],
      [WidthMode.EMOJI_WIDTH, 2],
      [WidthMode.PRIVATE_USE_WIDTH, 2],
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const first = await detector.detect()
    const second = await detector.detect()
    expect(first).toBe(second) // Same object reference
    // Only 4 queries sent total (not 8)
    expect(terminal.written.length).toBe(4)

    detector.dispose()
  })

  it("sends correct DECRQM queries", async () => {
    const terminal = createMockTerminal(
      new Map([
        [WidthMode.UTF8, 1],
        [WidthMode.CJK_WIDTH, 1],
        [WidthMode.EMOJI_WIDTH, 1],
        [WidthMode.PRIVATE_USE_WIDTH, 1],
      ]),
    )
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    await detector.detect()

    expect(terminal.written).toEqual([
      `\x1b[?${WidthMode.UTF8}$p`,
      `\x1b[?${WidthMode.CJK_WIDTH}$p`,
      `\x1b[?${WidthMode.EMOJI_WIDTH}$p`,
      `\x1b[?${WidthMode.PRIVATE_USE_WIDTH}$p`,
    ])

    detector.dispose()
  })

  it("exposes config as null before detection and populated after", async () => {
    const responses = new Map([
      [WidthMode.UTF8, 1],
      [WidthMode.CJK_WIDTH, 2],
      [WidthMode.EMOJI_WIDTH, 1],
      [WidthMode.PRIVATE_USE_WIDTH, 2],
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    expect(detector.config).toBeNull()
    await detector.detect()
    expect(detector.config).not.toBeNull()
    expect(detector.config!.utf8).toBe(true)

    detector.dispose()
  })

  it("returns defaults after dispose without prior detection", async () => {
    const terminal = createMockTerminal(new Map())
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    detector.dispose()
    const config = await detector.detect()
    expect(config).toEqual(DEFAULT_WIDTH_CONFIG)
  })

  it("dispose cleans up handlers", async () => {
    const terminal = createMockTerminal(new Map())
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    detector.dispose()
    // After dispose, no handlers should be actively subscribed
    // (any in-flight queries would have their cleanup called on resolve/timeout)
    expect(terminal.handlers.length).toBe(0)
  })

  it("handles partial/buffered responses", async () => {
    // Simulate terminal that sends response in chunks
    const handlers: Array<(data: string) => void> = []
    const write = (data: string) => {
      const match = data.match(/\x1b\[\?(\d+)\$p/)
      if (match) {
        const mode = parseInt(match[1]!, 10)
        const response = decrpm(mode, 1)
        // Split response into two chunks
        const mid = Math.floor(response.length / 2)
        setTimeout(() => {
          for (const h of handlers) h(response.slice(0, mid))
        }, 1)
        setTimeout(() => {
          for (const h of handlers) h(response.slice(mid))
        }, 2)
      }
    }
    const onData = (handler: (data: string) => void) => {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    }

    const detector = createWidthDetector({ write, onData, timeoutMs: 500 })
    const config = await detector.detect()

    // All modes should be detected as set (wide)
    expect(config.utf8).toBe(true)
    expect(config.cjkWidth).toBe(2)
    expect(config.emojiWidth).toBe(2)
    expect(config.privateUseWidth).toBe(2)

    detector.dispose()
  })
})

describe("WidthMode constants", () => {
  it("has the correct mode numbers", () => {
    expect(WidthMode.UTF8).toBe(1020)
    expect(WidthMode.CJK_WIDTH).toBe(1021)
    expect(WidthMode.EMOJI_WIDTH).toBe(1022)
    expect(WidthMode.PRIVATE_USE_WIDTH).toBe(1023)
  })
})

describe("DEFAULT_WIDTH_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_WIDTH_CONFIG.utf8).toBe(true)
    expect(DEFAULT_WIDTH_CONFIG.cjkWidth).toBe(1)
    expect(DEFAULT_WIDTH_CONFIG.emojiWidth).toBe(2)
    expect(DEFAULT_WIDTH_CONFIG.privateUseWidth).toBe(1)
  })
})

describe("applyWidthConfig", () => {
  // Post km-silvery.caps-restructure (Phase 7): applyWidthConfig takes caps +
  // heuristics as separate args (textEmojiWide moved to heuristics) and
  // returns `{ caps, heuristics }`.
  it("maps emojiWidth=2 to heuristics.textEmojiWide=true", () => {
    const caps = { textSizing: false, other: "preserved" }
    const heuristics = { textEmojiWide: false }
    const config: TerminalWidthConfig = {
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 2,
      privateUseWidth: 1,
    }
    const result = applyWidthConfig(caps, heuristics, config)
    expect(result.heuristics.textEmojiWide).toBe(true)
    expect(result.caps.other).toBe("preserved")
  })

  it("maps emojiWidth=1 to heuristics.textEmojiWide=false", () => {
    const caps = { textSizing: false }
    const heuristics = { textEmojiWide: true }
    const config: TerminalWidthConfig = {
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 1,
      privateUseWidth: 1,
    }
    const result = applyWidthConfig(caps, heuristics, config)
    expect(result.heuristics.textEmojiWide).toBe(false)
  })

  it("maps privateUseWidth=2 to caps.textSizing=true", () => {
    const caps = { textSizing: false }
    const heuristics = { textEmojiWide: true }
    const config: TerminalWidthConfig = {
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 2,
      privateUseWidth: 2,
    }
    const result = applyWidthConfig(caps, heuristics, config)
    expect(result.caps.textSizing).toBe(true)
  })

  it("maps privateUseWidth=1 to caps.textSizing=false", () => {
    const caps = { textSizing: true }
    const heuristics = { textEmojiWide: true }
    const config: TerminalWidthConfig = {
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 2,
      privateUseWidth: 1,
    }
    const result = applyWidthConfig(caps, heuristics, config)
    expect(result.caps.textSizing).toBe(false)
  })

  it("detected config overrides width measurement via measurer", async () => {
    // Without emoji wide: text-presentation emoji = 1 cell
    const narrow = createWidthMeasurer({ textEmojiWide: false })
    // With emoji wide: text-presentation emoji = 2 cells
    const wide = createWidthMeasurer({ textEmojiWide: true })

    // Warning sign (⚠) is a text-presentation emoji
    const warningSign = "\u26A0"
    expect(narrow.graphemeWidth(warningSign)).toBe(1)
    expect(wide.graphemeWidth(warningSign)).toBe(2)
  })
})

describe("width detection → measurer integration", () => {
  it("detection results flow through to measurer via applyWidthConfig", async () => {
    // Simulate a terminal that reports emoji=narrow, PUA=wide
    const responses = new Map([
      [WidthMode.UTF8, 1],
      [WidthMode.CJK_WIDTH, 2], // reset (narrow)
      [WidthMode.EMOJI_WIDTH, 2], // reset (narrow/1-cell)
      [WidthMode.PRIVATE_USE_WIDTH, 1], // set (wide/2-cell)
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const widthConfig = await detector.detect()
    detector.dispose()

    // Start with default caps + heuristics — Phase 7 split textEmojiWide out
    // to TerminalHeuristics while keeping textSizing on caps.
    const defaultCaps = { textSizing: false }
    const defaultHeuristics = { textEmojiWide: true }
    const { caps: updatedCaps, heuristics: updatedHeuristics } = applyWidthConfig(
      defaultCaps,
      defaultHeuristics,
      widthConfig,
    )

    // Detection should have overridden: emoji → narrow, PUA → wide
    expect(updatedHeuristics.textEmojiWide).toBe(false) // emojiWidth=1 → textEmojiWide=false
    expect(updatedCaps.textSizing).toBe(true) // privateUseWidth=2 → textSizing=true

    // Create measurer from updated caps — map textSizing → textSizingEnabled
    const measurer = createWidthMeasurer({
      textEmojiWide: updatedHeuristics.textEmojiWide,
      textSizingEnabled: updatedCaps.textSizing,
    })
    expect(measurer.textEmojiWide).toBe(false)
    expect(measurer.textSizingEnabled).toBe(true)

    // Warning sign (⚠) — text-presentation emoji
    const warningSign = "\u26A0"
    expect(measurer.graphemeWidth(warningSign)).toBe(1) // narrow because textEmojiWide=false
  })

  it("emoji width from DEC 1022 overrides default textEmojiWide", async () => {
    // Terminal reports emoji=narrow (DEC 1022 = reset/2)
    const responses = new Map([
      [WidthMode.UTF8, 1],
      [WidthMode.CJK_WIDTH, 1],
      [WidthMode.EMOJI_WIDTH, 2], // reset → narrow (1-cell)
      [WidthMode.PRIVATE_USE_WIDTH, 2],
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const widthConfig = await detector.detect()
    detector.dispose()

    // Default caps assume emoji=wide (Phase 7: heuristics carry textEmojiWide)
    const caps = { textSizing: false }
    const heuristics = { textEmojiWide: true }
    const { heuristics: updatedHeuristics } = applyWidthConfig(caps, heuristics, widthConfig)

    // DEC 1022=reset overrides the default
    expect(updatedHeuristics.textEmojiWide).toBe(false)
    const measurer = createWidthMeasurer({ textEmojiWide: updatedHeuristics.textEmojiWide })
    const warningSign = "\u26A0"
    expect(measurer.graphemeWidth(warningSign)).toBe(1)
  })

  it("CJK width from DEC 1021 is reported in config", async () => {
    // Terminal reports CJK=wide (DEC 1021 = set/1)
    const responses = new Map([
      [WidthMode.UTF8, 1],
      [WidthMode.CJK_WIDTH, 1], // set → wide (2-cell)
      [WidthMode.EMOJI_WIDTH, 1],
      [WidthMode.PRIVATE_USE_WIDTH, 2],
    ])
    const terminal = createMockTerminal(responses)
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 500,
    })

    const widthConfig = await detector.detect()
    detector.dispose()

    // CJK width is informational in the config
    expect(widthConfig.cjkWidth).toBe(2)
  })

  it("timeout leaves default values — measurer uses defaults", async () => {
    // Terminal that never responds
    const terminal = createMockTerminal(new Map())
    const detector = createWidthDetector({
      write: terminal.write,
      onData: terminal.onData,
      timeoutMs: 50,
    })

    const widthConfig = await detector.detect()
    detector.dispose()

    // Should be all defaults
    expect(widthConfig).toEqual(DEFAULT_WIDTH_CONFIG)

    // Applying defaults to default caps should be a no-op (Phase 7 shape).
    const caps = { textSizing: false }
    const heuristics = { textEmojiWide: true }
    const { caps: updatedCaps, heuristics: updatedHeuristics } = applyWidthConfig(
      caps,
      heuristics,
      widthConfig,
    )
    expect(updatedHeuristics.textEmojiWide).toBe(true) // default emojiWidth=2 → wide
    expect(updatedCaps.textSizing).toBe(false) // default privateUseWidth=1 → not supported

    // Measurer should use the default wide emoji behavior
    const measurer = createWidthMeasurer({
      textEmojiWide: updatedHeuristics.textEmojiWide,
      textSizingEnabled: updatedCaps.textSizing,
    })
    const warningSign = "\u26A0"
    expect(measurer.graphemeWidth(warningSign)).toBe(2) // default: wide
  })

  it("full detect→apply→measurer pipeline with narrow emoji", async () => {
    // Simulate detection: emoji=narrow, PUA=narrow
    const widthConfig: TerminalWidthConfig = {
      utf8: true,
      cjkWidth: 1,
      emojiWidth: 1, // narrow
      privateUseWidth: 1,
    }

    // Start with default caps + heuristics (Phase 7 shape, emoji=wide by default).
    const initialCaps = { textSizing: false }
    const initialHeuristics = { textEmojiWide: true }

    // Apply width config — maps emoji=narrow to textEmojiWide=false
    const { caps: updatedCaps, heuristics: updatedHeuristics } = applyWidthConfig(
      initialCaps,
      initialHeuristics,
      widthConfig,
    )
    expect(updatedHeuristics.textEmojiWide).toBe(false)
    expect(updatedCaps.textSizing).toBe(false)

    // Create measurer from updated caps (same as createPipeline does internally)
    const measurer = createWidthMeasurer({
      textEmojiWide: updatedHeuristics.textEmojiWide,
      textSizingEnabled: updatedCaps.textSizing,
    })
    expect(measurer.textEmojiWide).toBe(false)

    // Verify the measurer measures correctly with detected settings
    const warningSign = "\u26A0"
    expect(measurer.graphemeWidth(warningSign)).toBe(1) // narrow
  })
})
