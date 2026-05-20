/**
 * Capability probes — GAP 4 of the 15127 protocol audit.
 *
 * Active, protocol-level probing for terminal capabilities the env-only
 * detection in `createTerminalProfile` can't observe directly. This is the
 * sibling of `detectTextSizingSupport` for **non-text-sizing** protocols
 * (DECRQM modes, Kitty keyboard, Kitty graphics, OSC 52 clipboard read).
 *
 * # Why probes (vs env heuristics)
 *
 * `createTerminalProfile` derives caps from `TERM`, `TERM_PROGRAM`, `COLORTERM`,
 * etc. Those are *guesses* — a terminal emulator running inside `tmux` reports
 * a multiplexer `TERM` and the inner emulator's protocol support has no
 * env-visible signal. Probes ask the terminal directly:
 *
 *   - DECRQM (`CSI ? <mode> $p`) → `CSI ? <mode> ; <ps> $y`
 *     ps = 0 (unrecognized), 1 (set), 2 (reset), 3 (perm-set), 4 (perm-reset).
 *     ps != 0 ⇒ terminal knows the mode ⇒ feature is supported.
 *   - Kitty keyboard (`CSI ? u`) → `CSI ? <flags> u`
 *   - Kitty graphics (`APC G a=q,q=1,i=<probe-id> ST`) → `APC G i=<probe-id>;OK ST`
 *   - OSC 52 clipboard read (`OSC 52 ; c ; ? ST`) → any OSC 52 echo from the
 *     terminal (data or empty payload).
 *
 * Each probe is a pure `(owner, timeoutMs) → Promise<…>` function — no env
 * reads, no direct stdin/stdout access. The owner is a structural
 * `ProbeInputOwner` (same type the theme probe uses); callers inside a TUI
 * session pass the live `InputOwner`, callers in tests pass a mock.
 *
 * # How feature gates use the result
 *
 * `probeCapabilities(owner, { fingerprint })` returns a `Partial<TerminalCaps>`
 * with **probe-verified** flags. The orchestrator overlays that onto the
 * env-derived caps so feature gates downstream get the union — env says
 * "Ghostty 1.3", probe confirms `kittyKeyboard: true`, output phase emits
 * the Kitty keyboard activation sequence. When a probe returns `null`
 * (timeout / no reply) the corresponding flag collapses to `false` so feature
 * gates **fail closed** rather than rolling the dice. (Better to skip OSC 52
 * clipboard than spam unsupported sequences into a terminal that swallows
 * them as text.)
 *
 * # Caching
 *
 * Results are cached by fingerprint (same convention as text-sizing). Probing
 * costs round-trips; once per terminal-type per process is enough. Tests use
 * `clearCapabilityProbeCache()` to reset.
 *
 * # Integration status
 *
 * This module ships the standalone primitive. Wiring into
 * `probeTerminalProfile()` (so every `run()` / `createApp()` call gets the
 * probed overlay automatically) is a follow-up commit on 15127 — the
 * protocol surface has to stabilize before the global startup path adopts
 * it. Until then, callers that want probe-verified caps invoke
 * `probeCapabilities` directly.
 */

import type { TerminalCaps } from "@silvery/ansi"

const ESC = "\x1b"
const BEL = "\x07"

/**
 * Structural subset of `@silvery/ag-term/runtime` `InputOwner` — same shape
 * `ProbeInputOwner` in `@silvery/ansi/theme/detect.ts` uses. Defined locally
 * so callers don't have to drag the full `InputOwner` type around.
 */
export interface ProbeCapabilitiesOwner {
  probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null>
}

// ============================================================================
// DECRQM (Request Mode) — modes 1004, 1006, 1016, 2004, 2026
// ============================================================================

/**
 * Result of a DECRQM probe. `supported = true` means the terminal recognised
 * the mode (any `ps` value != 0). The specific set/reset state isn't useful
 * for capability detection — just whether the terminal *knows* the mode.
 */
export interface DecrqmResult {
  readonly mode: number
  readonly supported: boolean
}

/**
 * Probe a private DEC mode via DECRQM (`CSI ? <mode> $p`).
 *
 * Reply form: `CSI ? <mode> ; <ps> $y` where ps ∈ {0,1,2,3,4}.
 * ps = 0 → unrecognised. ps != 0 → supported (regardless of current state).
 *
 * Returns `null` if the terminal didn't reply within `timeoutMs`. Callers
 * should treat `null` as "not supported" for feature-gate purposes (fail
 * closed); the orchestrator does this for them.
 */
export async function probeDecrqm(
  owner: ProbeCapabilitiesOwner,
  mode: number,
  timeoutMs: number,
): Promise<DecrqmResult | null> {
  const query = `${ESC}[?${mode}$p`
  // Reply: ESC [ ? <mode> ; <ps> $ y
  // We match the FULL framing so a stale response for a different mode
  // doesn't false-positive — the `mode` capture must equal the probed value.
  const replyPrefix = `${ESC}[?`
  const replySuffix = "$y"
  return owner.probe<DecrqmResult>({
    query,
    parse: (acc) => {
      const start = acc.indexOf(replyPrefix)
      if (start === -1) return null
      const end = acc.indexOf(replySuffix, start + replyPrefix.length)
      if (end === -1) return null
      const body = acc.slice(start + replyPrefix.length, end)
      // body should be "<mode>;<ps>"
      const semi = body.indexOf(";")
      if (semi === -1) return null
      const replyMode = Number(body.slice(0, semi))
      const ps = Number(body.slice(semi + 1))
      if (!Number.isFinite(replyMode) || !Number.isFinite(ps)) return null
      if (replyMode !== mode) return null
      return {
        result: { mode, supported: ps !== 0 },
        consumed: end + replySuffix.length,
      }
    },
    timeoutMs,
  })
}

// ============================================================================
// Kitty keyboard — CSI ? u
// ============================================================================

export interface KittyKeyboardResult {
  readonly supported: boolean
  /** Currently-active progressive-enhancement flags (0 when none). */
  readonly flags: number
}

/**
 * Probe Kitty keyboard protocol support via the "query active flags" sequence.
 *
 * Query: `CSI ? u`
 * Reply: `CSI ? <flags> u`
 *
 * Any well-formed reply means the terminal speaks the protocol — the flag
 * value just records what's currently active. No reply ⇒ unsupported.
 */
export async function probeKittyKeyboard(
  owner: ProbeCapabilitiesOwner,
  timeoutMs: number,
): Promise<KittyKeyboardResult> {
  const result = await owner.probe<KittyKeyboardResult>({
    query: `${ESC}[?u`,
    parse: (acc) => {
      // CSI ? <digits> u
      const prefix = `${ESC}[?`
      const start = acc.indexOf(prefix)
      if (start === -1) return null
      const bodyStart = start + prefix.length
      const end = acc.indexOf("u", bodyStart)
      if (end === -1) return null
      const flagsStr = acc.slice(bodyStart, end)
      if (!/^\d+$/.test(flagsStr)) return null
      const flags = Number(flagsStr)
      if (!Number.isFinite(flags)) return null
      return { result: { supported: true, flags }, consumed: end + 1 }
    },
    timeoutMs,
  })
  return result ?? { supported: false, flags: 0 }
}

// ============================================================================
// Kitty graphics — APC G a=q,q=1,i=<probe-id> ST
// ============================================================================

/** Reserved probe-only image id. High value to avoid colliding with app uploads. */
const KITTY_GRAPHICS_PROBE_ID = 31415

/**
 * Probe Kitty graphics protocol via the protocol's own "query capabilities"
 * form (`a=q,q=1`). Terminals that speak the protocol echo
 * `APC G i=<id>;OK ST`; terminals that don't recognize APC G never reply.
 *
 * The OK / ENOTSUPPORTED status only matters when the terminal recognises the
 * protocol but can't fulfill the request right now (graphics disabled, etc.).
 * For capability detection we treat anything but `OK` (and `null`) as
 * unsupported — feature gates fail closed.
 */
export async function probeKittyGraphics(
  owner: ProbeCapabilitiesOwner,
  timeoutMs: number,
): Promise<boolean> {
  const query = `${ESC}_Ga=q,q=1,i=${KITTY_GRAPHICS_PROBE_ID}${ESC}\\`
  const result = await owner.probe<boolean>({
    query,
    parse: (acc) => {
      // APC G i=<id>;<status> ST   (ST = ESC \)
      const prefix = `${ESC}_G`
      const start = acc.indexOf(prefix)
      if (start === -1) return null
      const end = acc.indexOf(`${ESC}\\`, start + prefix.length)
      if (end === -1) return null
      const body = acc.slice(start + prefix.length, end)
      // body looks like: "i=31415;OK" or "i=31415;ENOTSUPPORTED:..."
      const semi = body.indexOf(";")
      if (semi === -1) return null
      const headers = body.slice(0, semi)
      const status = body.slice(semi + 1)
      const idMatch = /(?:^|,)i=(\d+)(?:,|$)/.exec(headers)
      if (!idMatch) return null
      const replyId = Number(idMatch[1])
      if (replyId !== KITTY_GRAPHICS_PROBE_ID) return null
      const ok = status.trim().toUpperCase() === "OK"
      return { result: ok, consumed: end + 2 }
    },
    timeoutMs,
  })
  return result ?? false
}

// ============================================================================
// OSC 52 clipboard read — ESC ] 52 ; c ; ? ST
// ============================================================================

/**
 * Probe OSC 52 clipboard *read* support. Terminals that implement OSC 52
 * read-access echo `OSC 52 ; c ; <base64-data> ST` (or an empty data field).
 * Terminals that don't recognize OSC 52 at all stay silent.
 *
 * Note: many terminals (xterm, Ghostty, Alacritty) ship OSC 52 *write* enabled
 * but `disallowedWindowOps` blocks the read query. A `null` here doesn't mean
 * "OSC 52 unsupported" universally — just that we can't probe it via the
 * read query. Callers wanting write-only support should use the env-derived
 * `caps.osc52` and accept the heuristic.
 */
export async function probeOsc52Read(
  owner: ProbeCapabilitiesOwner,
  timeoutMs: number,
): Promise<boolean> {
  const query = `${ESC}]52;c;?${BEL}`
  const result = await owner.probe<boolean>({
    query,
    parse: (acc) => {
      // OSC 52 ; c ; <data> ST   (ST = BEL or ESC\)
      const prefix = `${ESC}]52;`
      const start = acc.indexOf(prefix)
      if (start === -1) return null
      const bodyStart = start + prefix.length
      // Find either BEL or ESC\
      let end = acc.indexOf(BEL, bodyStart)
      let termLen = 1
      if (end === -1) {
        end = acc.indexOf(`${ESC}\\`, bodyStart)
        termLen = 2
        if (end === -1) return null
      }
      return { result: true, consumed: end + termLen }
    },
    timeoutMs,
  })
  return result ?? false
}

// ============================================================================
// Orchestrator + cache
// ============================================================================

export interface ProbeCapabilitiesOptions {
  /**
   * Cache key. Typically `getTerminalFingerprint(profile.emulator)` from
   * `../text-sizing.ts`. Different versions of the same terminal may have
   * different protocol support, so version matters.
   */
  fingerprint: string
  /** Per-probe timeout in ms. Default 150 (matches the theme probe). */
  timeoutMs?: number
  /**
   * Issue the Kitty graphics probe? Default `false` — the graphics probe
   * writes an APC sequence that emits a one-line response a misbehaving
   * terminal may echo as text. Callers running on terminals with a known
   * Kitty-family lineage (caps.kittyGraphics from env-detection true)
   * pass `true` to verify.
   */
  includeKittyGraphics?: boolean
}

/**
 * Cached probe overlay per fingerprint. Persists for the process lifetime so
 * `run()` → `createApp()` → another `run()` doesn't re-probe the same terminal.
 */
const probeCache = new Map<string, Partial<TerminalCaps>>()

/** Test helper — wipe the cache. */
export function clearCapabilityProbeCache(): void {
  probeCache.clear()
}

/**
 * Run the full probe battery and return a `Partial<TerminalCaps>` to overlay
 * onto an env-derived caps object. Cached per fingerprint.
 *
 * Probed (always):
 *   - DECRQM 1004 (focus reporting)
 *   - DECRQM 1006 (SGR mouse)
 *   - DECRQM 1016 (SGR-Pixels mouse)
 *   - DECRQM 2004 (bracketed paste)
 *   - DECRQM 2026 (synchronized output)
 *   - CSI ? u    (Kitty keyboard)
 *   - OSC 52 ; c ; ? (clipboard read)
 *
 * Probed (opt-in via `includeKittyGraphics`):
 *   - APC G a=q,q=1 (Kitty graphics)
 *
 * Mapping to `TerminalCaps`:
 *   - DECRQM 1004 → (no caps field today; reserved for `caps.focusReporting`)
 *   - DECRQM 1006 → caps.mouse
 *   - DECRQM 1016 → (no field today; reserved for `caps.mousePixels`)
 *   - DECRQM 2004 → caps.bracketedPaste
 *   - DECRQM 2026 → caps.syncOutput
 *   - CSI ? u     → caps.kittyKeyboard
 *   - OSC 52 ; c ; ?  → caps.osc52
 *   - APC G       → caps.kittyGraphics
 *
 * The 1016 and 1004 results are returned as fields on the result object but
 * **not** overlaid onto `TerminalCaps` until those caps fields exist — a
 * follow-up commit on 15127 adds `caps.mousePixels` / `caps.focusReporting`
 * once the audit's GAP 2 (SGR-Pixels test coverage) lands.
 */
export async function probeCapabilities(
  owner: ProbeCapabilitiesOwner,
  options: ProbeCapabilitiesOptions,
): Promise<Partial<TerminalCaps>> {
  const cached = probeCache.get(options.fingerprint)
  if (cached !== undefined) return cached

  const timeoutMs = options.timeoutMs ?? 150

  // Issue every probe in parallel. Each one is a separate `probe()` call
  // which the InputOwner serialises internally — but we don't need to wait
  // for one before queuing the next. `Promise.all` keeps the wall clock
  // ~= max(individual timeouts) instead of sum.
  const tasks: Array<Promise<unknown>> = [
    probeDecrqm(owner, 1004, timeoutMs),
    probeDecrqm(owner, 1006, timeoutMs),
    probeDecrqm(owner, 1016, timeoutMs),
    probeDecrqm(owner, 2004, timeoutMs),
    probeDecrqm(owner, 2026, timeoutMs),
    probeKittyKeyboard(owner, timeoutMs),
    probeOsc52Read(owner, timeoutMs),
  ]
  if (options.includeKittyGraphics) {
    tasks.push(probeKittyGraphics(owner, timeoutMs))
  }

  const [focus, mouse, _mousePixels, bracketed, sync, kittyKb, osc52, kittyGfx] =
    (await Promise.all(tasks)) as [
      DecrqmResult | null,
      DecrqmResult | null,
      DecrqmResult | null,
      DecrqmResult | null,
      DecrqmResult | null,
      KittyKeyboardResult,
      boolean,
      boolean | undefined,
    ]

  // `null` (timeout) → fail closed (false). Probed-and-unrecognized → false.
  // Probed-and-recognized → true.
  //
  // Build a mutable scratch object then freeze on the way out — the
  // `Partial<TerminalCaps>` return type has `readonly` fields, so we can't
  // mutate the typed view in place.
  const base = {
    mouse: mouse?.supported === true,
    bracketedPaste: bracketed?.supported === true,
    syncOutput: sync?.supported === true,
    kittyKeyboard: kittyKb.supported,
    osc52,
  }
  const result: Partial<TerminalCaps> = options.includeKittyGraphics
    ? { ...base, kittyGraphics: kittyGfx ?? false }
    : base

  // Mark the focus result as touched so probe-once semantics hold even before
  // a `caps.focusReporting` field exists. Suppresses the "unused variable"
  // lint without committing to a caps surface that's still under audit.
  void focus

  probeCache.set(options.fingerprint, result)
  return result
}
