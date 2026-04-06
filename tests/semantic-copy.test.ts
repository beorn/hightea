/**
 * Tests for semantic copy types and factory functions.
 */
import { describe, test, expect } from "vitest"
import {
  createPasteEvent,
  createCopyProvider,
  type ClipboardData,
  type CopyEvent,
  type SemanticCopyProvider,
} from "../packages/ag-term/src/semantic-copy"

// ============================================================================
// createPasteEvent
// ============================================================================

describe("createPasteEvent", () => {
  test("creates external paste event when no internal clipboard", () => {
    const event = createPasteEvent("pasted text", null)

    expect(event.text).toBe("pasted text")
    expect(event.source).toBe("external")
    expect(event.data).toBeUndefined()
  })

  test("creates external paste event when text does not match internal clipboard", () => {
    const clipboard: ClipboardData = {
      text: "different text",
      markdown: "**different text**",
    }
    const event = createPasteEvent("pasted text", clipboard)

    expect(event.text).toBe("pasted text")
    expect(event.source).toBe("external")
    expect(event.data).toBeUndefined()
  })

  test("creates internal paste event when text matches internal clipboard", () => {
    const clipboard: ClipboardData = {
      text: "matching text",
      markdown: "**matching text**",
      html: "<strong>matching text</strong>",
      internal: { id: 42 },
    }
    const event = createPasteEvent("matching text", clipboard)

    expect(event.text).toBe("matching text")
    expect(event.source).toBe("internal")
    expect(event.data).toBe(clipboard)
  })
})

// ============================================================================
// createCopyProvider
// ============================================================================

describe("createCopyProvider", () => {
  test("creates a provider from a sync enrichment function", () => {
    const provider = createCopyProvider((event) => ({
      text: event.text,
      markdown: `**${event.text}**`,
    }))

    expect(provider.enrichCopy).toBeDefined()

    const copyEvent: CopyEvent = {
      text: "hello",
      range: { anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } },
    }
    const result = provider.enrichCopy(copyEvent) as ClipboardData

    expect(result.text).toBe("hello")
    expect(result.markdown).toBe("**hello**")
  })

  test("creates a provider from an async enrichment function", async () => {
    const provider = createCopyProvider(async (event) => ({
      text: event.text,
      html: `<p>${event.text}</p>`,
    }))

    const copyEvent: CopyEvent = {
      text: "world",
      range: { anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } },
    }
    const result = (await provider.enrichCopy(copyEvent)) as ClipboardData

    expect(result.text).toBe("world")
    expect(result.html).toBe("<p>world</p>")
  })

  test("creates a provider that returns void (no enrichment)", () => {
    const provider = createCopyProvider(() => {
      // No enrichment
    })

    const copyEvent: CopyEvent = {
      text: "text",
      range: { anchor: { col: 0, row: 0 }, head: { col: 3, row: 0 } },
    }
    const result = provider.enrichCopy(copyEvent)

    expect(result).toBeUndefined()
  })
})

// ============================================================================
// SemanticCopyProvider interface
// ============================================================================

describe("SemanticCopyProvider interface", () => {
  test("sync enrichment returns ClipboardData", () => {
    const provider: SemanticCopyProvider = {
      enrichCopy(event) {
        return {
          text: event.text,
          markdown: `# ${event.text}`,
          internal: { nodeId: "abc" },
        }
      },
    }

    const result = provider.enrichCopy({
      text: "Title",
      range: { anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } },
    }) as ClipboardData

    expect(result.text).toBe("Title")
    expect(result.markdown).toBe("# Title")
    expect(result.internal).toEqual({ nodeId: "abc" })
  })

  test("async enrichment returns Promise<ClipboardData>", async () => {
    const provider: SemanticCopyProvider = {
      async enrichCopy(event) {
        return {
          text: event.text,
          html: `<h1>${event.text}</h1>`,
        }
      },
    }

    const result = (await provider.enrichCopy({
      text: "Heading",
      range: { anchor: { col: 0, row: 0 }, head: { col: 6, row: 0 } },
    })) as ClipboardData

    expect(result.text).toBe("Heading")
    expect(result.html).toBe("<h1>Heading</h1>")
  })

  test("void enrichment is valid (plain text only)", () => {
    const provider: SemanticCopyProvider = {
      enrichCopy() {
        // Intentionally no return — plain text only
      },
    }

    const result = provider.enrichCopy({
      text: "plain",
      range: { anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } },
    })

    expect(result).toBeUndefined()
  })
})
