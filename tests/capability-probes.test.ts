/**
 * Capability probe tests — GAP 4 of 15127 protocol audit.
 *
 * Verifies probe-based capability negotiation for OSC/CSI/APC variants the
 * env-only detection (`createTerminalProfile`) can't observe directly.
 *
 * Pattern mirrors `text-sizing-probe.test.ts`: each probe is pure
 * `(query, parse, timeoutMs) → Promise<T | null>` via a mocked `ProbeInputOwner`.
 * No `process.env` reads, no real stdin/stdout — every test is deterministic.
 *
 * Acceptance per bead 15127 capability-probes:
 *   1. Probe runs at terminal init; captures support matrix.
 *   2. Tests verify probe detection across xterm / Ghostty / Kitty / Alacritty fixtures.
 *   3. Cap matrix used by feature gates.
 *
 * This file covers (1) and (2). (3) — wiring into the feature-gate sites — is
 * a separate commit; the probe contract has to stabilise first.
 */

import { describe, expect, test, beforeEach } from "vitest"
import {
  probeCapabilities,
  probeDecrqm,
  probeKittyKeyboard,
  probeKittyGraphics,
  probeOsc52Read,
  clearCapabilityProbeCache,
  type ProbeCapabilitiesOwner,
} from "../packages/ag-term/src/ansi/capability-probes"

// ============================================================================
// Test harness — a deterministic ProbeInputOwner that queues canned responses.
// ============================================================================

/**
 * Build a mock InputOwner. `responses` maps a query string to a fixed reply
 * the parser will see on its accumulated-buffer pass. Probes whose query
 * is absent from the map get `null` (timeout/no response).
 */
function makeOwner(responses: Record<string, string>): ProbeCapabilitiesOwner & {
  written: string[]
} {
  const written: string[] = []
  return {
    written,
    async probe<T>(opts: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
      timeoutMs: number
    }): Promise<T | null> {
      written.push(opts.query)
      const reply = responses[opts.query]
      if (reply === undefined) return null
      const parsed = opts.parse(reply)
      return parsed ? parsed.result : null
    },
  }
}

// ============================================================================
// DECRQM probe — modes 1004, 1006, 1016, 2004, 2026
// ============================================================================

describe("probeDecrqm", () => {
  test("set (ps=1) → mode supported", async () => {
    const owner = makeOwner({
      "\x1b[?2026$p": "\x1b[?2026;1$y",
    })
    const result = await probeDecrqm(owner, 2026, 50)
    expect(result).toEqual({ mode: 2026, supported: true })
  })

  test("reset (ps=2) → mode supported", async () => {
    const owner = makeOwner({
      "\x1b[?1006$p": "\x1b[?1006;2$y",
    })
    const result = await probeDecrqm(owner, 1006, 50)
    expect(result).toEqual({ mode: 1006, supported: true })
  })

  test("permanently set (ps=3) → mode supported", async () => {
    const owner = makeOwner({
      "\x1b[?2004$p": "\x1b[?2004;3$y",
    })
    const result = await probeDecrqm(owner, 2004, 50)
    expect(result).toEqual({ mode: 2004, supported: true })
  })

  test("permanently reset (ps=4) → mode supported", async () => {
    const owner = makeOwner({
      "\x1b[?1004$p": "\x1b[?1004;4$y",
    })
    const result = await probeDecrqm(owner, 1004, 50)
    expect(result).toEqual({ mode: 1004, supported: true })
  })

  test("unrecognized (ps=0) → mode UNSUPPORTED", async () => {
    const owner = makeOwner({
      "\x1b[?1016$p": "\x1b[?1016;0$y",
    })
    const result = await probeDecrqm(owner, 1016, 50)
    expect(result).toEqual({ mode: 1016, supported: false })
  })

  test("no response (timeout) → null", async () => {
    const owner = makeOwner({})
    const result = await probeDecrqm(owner, 2026, 50)
    expect(result).toBeNull()
  })

  test("mismatched mode in reply → null", async () => {
    // Reply mentions mode 1234, not the queried 1006.
    const owner = makeOwner({
      "\x1b[?1006$p": "\x1b[?1234;1$y",
    })
    const result = await probeDecrqm(owner, 1006, 50)
    expect(result).toBeNull()
  })

  test("writes the canonical DECRQM query", async () => {
    const owner = makeOwner({})
    await probeDecrqm(owner, 2026, 50)
    expect(owner.written).toEqual(["\x1b[?2026$p"])
  })
})

// ============================================================================
// Kitty keyboard protocol probe — CSI ? u
// ============================================================================

describe("probeKittyKeyboard", () => {
  test("reply with flags=0 → supported, no flags set", async () => {
    const owner = makeOwner({
      "\x1b[?u": "\x1b[?0u",
    })
    const result = await probeKittyKeyboard(owner, 50)
    expect(result).toEqual({ supported: true, flags: 0 })
  })

  test("reply with flags=31 (all flags) → supported", async () => {
    const owner = makeOwner({
      "\x1b[?u": "\x1b[?31u",
    })
    const result = await probeKittyKeyboard(owner, 50)
    expect(result).toEqual({ supported: true, flags: 31 })
  })

  test("no response → not supported", async () => {
    const owner = makeOwner({})
    const result = await probeKittyKeyboard(owner, 50)
    expect(result).toEqual({ supported: false, flags: 0 })
  })

  test("malformed reply → not supported", async () => {
    const owner = makeOwner({
      "\x1b[?u": "\x1b[?garbage",
    })
    const result = await probeKittyKeyboard(owner, 50)
    expect(result).toEqual({ supported: false, flags: 0 })
  })
})

// ============================================================================
// Kitty graphics probe — APC G a=q;q=1;i=<id> ST
// ============================================================================

describe("probeKittyGraphics", () => {
  test("OK reply → supported", async () => {
    const owner = makeOwner({
      "\x1b_Ga=q,q=1,i=31415\x1b\\": "\x1b_Gi=31415;OK\x1b\\",
    })
    const result = await probeKittyGraphics(owner, 50)
    expect(result).toBe(true)
  })

  test("ERROR reply → not supported", async () => {
    const owner = makeOwner({
      "\x1b_Ga=q,q=1,i=31415\x1b\\": "\x1b_Gi=31415;ENOTSUPPORTED:graphics disabled\x1b\\",
    })
    const result = await probeKittyGraphics(owner, 50)
    expect(result).toBe(false)
  })

  test("no response (timeout) → not supported", async () => {
    const owner = makeOwner({})
    const result = await probeKittyGraphics(owner, 50)
    expect(result).toBe(false)
  })

  test("mismatched id → not supported", async () => {
    // Terminal replied for a different image id; not our probe.
    const owner = makeOwner({
      "\x1b_Ga=q,q=1,i=31415\x1b\\": "\x1b_Gi=99999;OK\x1b\\",
    })
    const result = await probeKittyGraphics(owner, 50)
    expect(result).toBe(false)
  })
})

// ============================================================================
// OSC 52 read probe — ESC ] 52 ; c ; ? ST  → response or no-response
// ============================================================================

describe("probeOsc52Read", () => {
  test("clipboard read echo (base64 payload) → supported", async () => {
    const owner = makeOwner({
      "\x1b]52;c;?\x07": "\x1b]52;c;aGVsbG8=\x07",
    })
    const result = await probeOsc52Read(owner, 50)
    expect(result).toBe(true)
  })

  test("clipboard read echo with ST terminator → supported", async () => {
    const owner = makeOwner({
      "\x1b]52;c;?\x07": "\x1b]52;c;d29ybGQ=\x1b\\",
    })
    const result = await probeOsc52Read(owner, 50)
    expect(result).toBe(true)
  })

  test("no response → not supported", async () => {
    const owner = makeOwner({})
    const result = await probeOsc52Read(owner, 50)
    expect(result).toBe(false)
  })
})

// ============================================================================
// probeCapabilities — full orchestrator returning Partial<TerminalCaps>
// ============================================================================

describe("probeCapabilities", () => {
  beforeEach(() => {
    clearCapabilityProbeCache()
  })

  test("Ghostty fixture: kittyKeyboard + syncOutput + bracketedPaste + mouse + focus", async () => {
    // Ghostty supports Kitty keyboard, sync update, mouse, bracketed paste,
    // focus reporting. No Kitty graphics over plain TTY (depends on build).
    const owner = makeOwner({
      "\x1b[?u": "\x1b[?15u",
      "\x1b[?2026$p": "\x1b[?2026;2$y",
      "\x1b[?1006$p": "\x1b[?1006;2$y",
      "\x1b[?1016$p": "\x1b[?1016;2$y",
      "\x1b[?2004$p": "\x1b[?2004;2$y",
      "\x1b[?1004$p": "\x1b[?1004;2$y",
      "\x1b]52;c;?\x07": "\x1b]52;c;\x07",
    })
    const result = await probeCapabilities(owner, { fingerprint: "Ghostty@1.3.0", timeoutMs: 50 })
    expect(result.kittyKeyboard).toBe(true)
    expect(result.syncOutput).toBe(true)
    expect(result.mouse).toBe(true)
    expect(result.bracketedPaste).toBe(true)
    expect(result.osc52).toBe(true)
  })

  test("xterm fixture: bracketed paste + mouse only", async () => {
    // Classic xterm: no Kitty keyboard, no sync, no SGR-pixels.
    const owner = makeOwner({
      "\x1b[?2004$p": "\x1b[?2004;2$y",
      "\x1b[?1006$p": "\x1b[?1006;2$y",
      "\x1b[?2026$p": "\x1b[?2026;0$y", // unrecognized
      "\x1b[?1016$p": "\x1b[?1016;0$y", // unrecognized
      "\x1b[?u": "", // no reply
    })
    const result = await probeCapabilities(owner, { fingerprint: "xterm@370", timeoutMs: 50 })
    expect(result.kittyKeyboard).toBe(false)
    expect(result.syncOutput).toBe(false)
    expect(result.mouse).toBe(true)
    expect(result.bracketedPaste).toBe(true)
  })

  test("Alacritty fixture: mouse + bracketed paste + sync, no Kitty keyboard or graphics", async () => {
    const owner = makeOwner({
      "\x1b[?2004$p": "\x1b[?2004;2$y",
      "\x1b[?1006$p": "\x1b[?1006;2$y",
      "\x1b[?2026$p": "\x1b[?2026;2$y",
      "\x1b[?1016$p": "\x1b[?1016;0$y",
      "\x1b[?u": "", // no Kitty keyboard
      "\x1b_Ga=q,q=1,i=31415\x1b\\": "", // no Kitty graphics
    })
    const result = await probeCapabilities(owner, {
      fingerprint: "alacritty@0.13",
      timeoutMs: 50,
      includeKittyGraphics: true,
    })
    expect(result.kittyKeyboard).toBe(false)
    expect(result.kittyGraphics).toBe(false)
    expect(result.syncOutput).toBe(true)
  })

  test("Kitty fixture: full kitty stack", async () => {
    const owner = makeOwner({
      "\x1b[?u": "\x1b[?31u",
      "\x1b[?2026$p": "\x1b[?2026;2$y",
      "\x1b[?1006$p": "\x1b[?1006;2$y",
      "\x1b[?1016$p": "\x1b[?1016;2$y",
      "\x1b[?2004$p": "\x1b[?2004;2$y",
      "\x1b[?1004$p": "\x1b[?1004;2$y",
      "\x1b_Ga=q,q=1,i=31415\x1b\\": "\x1b_Gi=31415;OK\x1b\\",
      "\x1b]52;c;?\x07": "\x1b]52;c;\x07",
    })
    const result = await probeCapabilities(owner, {
      fingerprint: "kitty@0.40.0",
      timeoutMs: 50,
      includeKittyGraphics: true,
    })
    expect(result.kittyKeyboard).toBe(true)
    expect(result.kittyGraphics).toBe(true)
    expect(result.syncOutput).toBe(true)
    expect(result.osc52).toBe(true)
  })

  test("dumb terminal (no replies anywhere) → all flags false", async () => {
    const owner = makeOwner({})
    const result = await probeCapabilities(owner, { fingerprint: "dumb@1", timeoutMs: 50 })
    expect(result.kittyKeyboard).toBe(false)
    expect(result.syncOutput).toBe(false)
    expect(result.bracketedPaste).toBe(false)
    expect(result.mouse).toBe(false)
    expect(result.osc52).toBe(false)
  })

  test("cache: repeated probe for same fingerprint does NOT re-query", async () => {
    const owner = makeOwner({
      "\x1b[?2026$p": "\x1b[?2026;2$y",
    })
    await probeCapabilities(owner, { fingerprint: "test@1", timeoutMs: 50 })
    const firstWrites = owner.written.length
    expect(firstWrites).toBeGreaterThan(0)

    await probeCapabilities(owner, { fingerprint: "test@1", timeoutMs: 50 })
    expect(owner.written.length).toBe(firstWrites) // no new queries
  })

  test("cache: different fingerprints keep independent entries", async () => {
    const ownerA = makeOwner({
      "\x1b[?2026$p": "\x1b[?2026;2$y",
    })
    const ownerB = makeOwner({
      "\x1b[?2026$p": "\x1b[?2026;0$y",
    })
    const a = await probeCapabilities(ownerA, { fingerprint: "term-a@1", timeoutMs: 50 })
    const b = await probeCapabilities(ownerB, { fingerprint: "term-b@1", timeoutMs: 50 })
    expect(a.syncOutput).toBe(true)
    expect(b.syncOutput).toBe(false)
  })

  test("clearCapabilityProbeCache resets cache", async () => {
    const owner = makeOwner({
      "\x1b[?2026$p": "\x1b[?2026;2$y",
    })
    await probeCapabilities(owner, { fingerprint: "test@1", timeoutMs: 50 })
    const beforeClear = owner.written.length
    clearCapabilityProbeCache()
    await probeCapabilities(owner, { fingerprint: "test@1", timeoutMs: 50 })
    expect(owner.written.length).toBeGreaterThan(beforeClear)
  })

  test("includeKittyGraphics: false (default) skips the Kitty graphics probe", async () => {
    const owner = makeOwner({})
    await probeCapabilities(owner, { fingerprint: "skip@1", timeoutMs: 50 })
    const writes = owner.written.filter((q) => q.includes("\x1b_G"))
    expect(writes).toHaveLength(0)
  })

  test("DECRQM probe returning null (timeout) treated as unsupported, not 'unknown'", async () => {
    // A non-responsive terminal shouldn't leave caps undefined — flags collapse
    // to `false` so feature gates fail closed (no clipboard write, no Kitty
    // keyboard activation) rather than rolling the dice.
    const owner = makeOwner({}) // every probe times out
    const result = await probeCapabilities(owner, {
      fingerprint: "unresponsive@1",
      timeoutMs: 50,
    })
    expect(result.bracketedPaste).toBe(false)
    expect(result.mouse).toBe(false)
    expect(result.kittyKeyboard).toBe(false)
    expect(result.syncOutput).toBe(false)
  })
})
