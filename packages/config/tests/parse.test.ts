import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineKind } from "../src/kind.ts"
import { formatString, parseString } from "../src/parse.ts"

const AcpKind = defineKind({
  name: "acp",
  schema: z
    .object({
      transport: z.string().optional(),
      agent: z.string(),
      account: z.string().optional(),
      model: z.string().optional(),
      bare: z.boolean().optional(),
      temp: z.number().optional(),
      tools: z.array(z.string()).optional(),
      mcp: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  pathField: "agent",
  coerce: { bare: "boolean", temp: "number", tools: "array" },
})

describe("parseString — basics", () => {
  it("parses bare path → pathField", () => {
    expect(parseString("claude-code", AcpKind)).toEqual({ agent: "claude-code" })
  })

  it("parses path + query", () => {
    expect(parseString("claude-code?model=opus-4.7", AcpKind)).toEqual({
      agent: "claude-code",
      model: "opus-4.7",
    })
  })

  it("parses bare key as boolean true", () => {
    expect(parseString("claude-code?bare", AcpKind)).toEqual({
      agent: "claude-code",
      bare: true,
    })
  })

  it("parses !key as boolean false", () => {
    expect(parseString("claude-code?!bare", AcpKind)).toEqual({
      agent: "claude-code",
      bare: false,
    })
  })

  it("parses bare=1 / bare=true / bare=0 / bare=false", () => {
    expect(parseString("claude-code?bare=1", AcpKind).bare).toBe(true)
    expect(parseString("claude-code?bare=true", AcpKind).bare).toBe(true)
    expect(parseString("claude-code?bare=0", AcpKind).bare).toBe(false)
    expect(parseString("claude-code?bare=false", AcpKind).bare).toBe(false)
  })

  it("coerces declared number fields", () => {
    expect(
      parseString("gemini?temp=0.7", { ...AcpKind, schema: AcpKind.schema as never }),
    ).toMatchObject({ agent: "gemini", temp: 0.7 })
  })

  it("preserves @ in account email without escaping", () => {
    expect(parseString("claude-code?account=bjorn@stabell.org&bare", AcpKind)).toEqual({
      agent: "claude-code",
      account: "bjorn@stabell.org",
      bare: true,
    })
  })

  it("parses comma-array when coerce hint is array", () => {
    expect(parseString("claude-code?tools=read,edit", AcpKind)).toEqual({
      agent: "claude-code",
      tools: ["read", "edit"],
    })
  })

  it("parses bracket-array regardless of hint", () => {
    expect(parseString("claude-code?tools[]=read&tools[]=edit", AcpKind)).toEqual({
      agent: "claude-code",
      tools: ["read", "edit"],
    })
  })

  it("parses dot-paths into nested objects", () => {
    const result = parseString("claude-code?mcp.km.cwd=/path&mcp.tribe.cwd=/elsewhere", AcpKind)
    expect(result).toEqual({
      agent: "claude-code",
      mcp: {
        km: { cwd: "/path" },
        tribe: { cwd: "/elsewhere" },
      },
    })
  })

  it("parses explicit scheme into transport", () => {
    expect(parseString("spawn://claude-code?bare", AcpKind)).toEqual({
      transport: "spawn",
      agent: "claude-code",
      bare: true,
    })
  })

  it("rejects empty string", () => {
    expect(() => parseString("", AcpKind)).toThrow(/empty/)
  })

  it("rejects path when kind has no pathField", () => {
    const NoPathKind = defineKind({
      name: "no-path",
      schema: z.object({ x: z.string().optional() }),
    })
    expect(() => parseString("foo", NoPathKind)).toThrow(/no pathField/)
  })

  it("decodes percent-encoded values", () => {
    expect(parseString("claude-code?account=foo%40bar.org", AcpKind).account).toBe("foo@bar.org")
  })
})

describe("formatString — basics", () => {
  it("formats path-only", () => {
    expect(formatString({ agent: "claude-code" }, AcpKind)).toBe("claude-code")
  })

  it("formats path + query", () => {
    expect(formatString({ agent: "claude-code", model: "opus-4.7" }, AcpKind)).toBe(
      "claude-code?model=opus-4.7",
    )
  })

  it("formats boolean true as bare key", () => {
    expect(formatString({ agent: "claude-code", bare: true }, AcpKind)).toBe("claude-code?bare")
  })

  it("formats boolean false as !key", () => {
    expect(formatString({ agent: "claude-code", bare: false }, AcpKind)).toBe("claude-code?!bare")
  })

  it("includes scheme when transport is set", () => {
    expect(formatString({ transport: "spawn", agent: "claude-code", bare: true }, AcpKind)).toBe(
      "spawn://claude-code?bare",
    )
  })

  it("formats arrays as comma form", () => {
    expect(formatString({ agent: "claude-code", tools: ["read", "edit"] }, AcpKind)).toBe(
      "claude-code?tools=read,edit",
    )
  })
})

describe("round-trip parse ↔ format", () => {
  const cases = [
    "claude-code",
    "claude-code?model=opus-4.7",
    "claude-code?account=bjorn@stabell.org",
    "claude-code?account=bjorn@stabell.org&model=opus-4.7&bare",
    "codex",
    "gemini?model=2.5-pro&temp=0.7",
    "spawn://claude-code?bare",
    "claude-code?tools=read,edit",
  ]

  for (const input of cases) {
    it(`round-trips: ${input}`, () => {
      const parsed = parseString(input, AcpKind)
      const formatted = formatString(parsed, AcpKind)
      const reparsed = parseString(formatted, AcpKind)
      expect(reparsed).toEqual(parsed)
    })
  }
})
