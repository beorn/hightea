import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { loadConfig } from "../src/config.ts"
import { defineKind } from "../src/kind.ts"
import type { Config } from "../src/types.ts"

const AcpKind = defineKind({
  name: "acp",
  schema: z
    .object({
      transport: z.string().optional(),
      agent: z.string(),
      account: z.string().optional(),
      model: z.string().optional(),
      bare: z.boolean().optional(),
      label: z.string().optional(),
      color: z.string().optional(),
    })
    .strict(),
  pathField: "agent",
  reservedKeys: ["default"],
  coerce: { bare: "boolean" },
})

let tmpDir: string
let config: Config

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvery-config-registry-"))
  await writeFile(
    join(tmpDir, "config.yaml"),
    `ai:
  acp:
    default: claude-work
    claude-work: "claude-code?account=bjorn@stabell.org&model=opus-4.7&bare"
    codex: "codex"
    claude-personal:
      base: "claude-code?account=bjorn-personal&model=sonnet-4.6"
      label: Claude · personal
      color: "#a0d8a0"
`,
  )
  config = await loadConfig({ path: join(tmpDir, "config.yaml") })
})

afterEach(async () => {
  // Tmpdir cleanup is best-effort; OS clears /tmp.
})

describe("Registry — entries / get / resolve", () => {
  it("lists entries (excludes reserved 'default')", () => {
    const reg = config.registry("ai.acp", AcpKind)
    const names = reg
      .entries()
      .map((e) => e.name)
      .sort()
    expect(names).toEqual(["claude-personal", "claude-work", "codex"])
  })

  it("parses string-form entries via the kind", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.get("claude-work")).toEqual({
      agent: "claude-code",
      account: "bjorn@stabell.org",
      model: "opus-4.7",
      bare: true,
    })
  })

  it("parses object-form entries with `base:` merge", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.get("claude-personal")).toEqual({
      agent: "claude-code",
      account: "bjorn-personal",
      model: "sonnet-4.6",
      label: "Claude · personal",
      color: "#a0d8a0",
    })
  })

  it("resolve(label) returns the entry", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.resolve("codex")).toEqual({ agent: "codex" })
  })

  it("resolve(connection-string) parses inline", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.resolve("gemini?model=2.5-pro")).toEqual({ agent: "gemini", model: "2.5-pro" })
  })

  it("resolve returns null for unknown label", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.resolve("missing")).toBeNull()
  })

  it("get returns undefined for reserved keys", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.get("default")).toBeUndefined()
  })

  it("default() reads ai.acp.default", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(reg.default()).toBe("claude-work")
  })
})

describe("Registry — mutation", () => {
  it("setDefault writes ai.acp.default", () => {
    const reg = config.registry("ai.acp", AcpKind)
    reg.setDefault("codex")
    expect(reg.default()).toBe("codex")
    expect(config.get("ai.acp.default")).toBe("codex")
  })

  it("add accepts string and validates via kind", () => {
    const reg = config.registry("ai.acp", AcpKind)
    reg.add("quick", "codex?model=gpt-5-mini")
    expect(reg.has("quick")).toBe(true)
    expect(reg.get("quick")).toEqual({ agent: "codex", model: "gpt-5-mini" })
  })

  it("add rejects reserved keys", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(() => reg.add("default", "codex")).toThrow(/reserved/)
  })

  it("rm removes an entry", () => {
    const reg = config.registry("ai.acp", AcpKind)
    reg.rm("codex")
    expect(reg.has("codex")).toBe(false)
    expect(
      reg
        .entries()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["claude-personal", "claude-work"])
  })

  it("rm rejects reserved keys", () => {
    const reg = config.registry("ai.acp", AcpKind)
    expect(() => reg.rm("default")).toThrow(/reserved/)
  })
})

describe("Registry — format (lossless round-trip)", () => {
  it("formats string-source entries back to a connection string", () => {
    const reg = config.registry("ai.acp", AcpKind)
    const out = reg.format("claude-work")
    expect(out).toContain("claude-code")
    expect(out).toContain("account=bjorn@stabell.org")
    expect(out).toContain("model=opus-4.7")
    expect(out).toContain("bare")
  })
})
