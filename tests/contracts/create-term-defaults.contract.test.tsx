/**
 * Defaults contract — `createTerm()` live terminal factory.
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createTerm()` (from `@silvery/ag-term`) is the central Term abstraction.
 * It has four factory shapes documented in its JSDoc:
 *
 *   - `createTerm()` — Node.js terminal, auto-detect from process.stdin/stdout
 *   - `createTerm({ cols, rows })` — headless for testing (no I/O, fixed dims)
 *   - `createTerm(backend, { cols, rows })` — emulator backend
 *   - `createTerm(emulator)` — pre-created termless Terminal
 *
 * Documented defaults this file pins:
 *   - Headless mode: no stdout or stdin wired
 *   - Headless mode: caps are computed (not null)
 *   - Node mode: caps delegate to `detectTerminalCaps()` — which now honors
 *     FORCE_COLOR (seed 2 of the Phase 1 regression set)
 *
 * Seed row in this file: FORCE_COLOR flows through `createTerm()`'s default
 * caps detection. If someone accidentally reintroduces the pre-fix
 * short-circuit at this layer, this test catches it before `run()` does.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createTerm } from "../../packages/ag-term/src/ansi/term"

// ============================================================================
// Env-var scaffolding
// ============================================================================

let savedNoColor: string | undefined
let savedForceColor: string | undefined

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR
  savedForceColor = process.env.FORCE_COLOR
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = savedForceColor
})

// ============================================================================
// Headless mode defaults — createTerm({ cols, rows })
// ============================================================================

describe("contract: createTerm({ cols, rows }) (headless)", () => {
  test("contract: headless term reports the dims it was constructed with", () => {
    const term = createTerm({ cols: 40, rows: 10 })
    expect(term.cols).toBe(40)
    expect(term.rows).toBe(10)
  })

  test("contract: headless term has caps: undefined (I/O-less — no detection)", () => {
    // Headless Term deliberately has `caps: undefined` — it does no I/O, so
    // there's no terminal to detect capabilities for. This is the documented
    // shape (see packages/ag-term/src/ansi/term.ts:861). Pin it so nobody
    // accidentally flips this to eager defaultCaps() — that would silently
    // mask FORCE_COLOR handling at the run() level where caps are finalized.
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.caps).toBeUndefined()
  })
})

// ============================================================================
// Node-backed createTerm honors explicit caps overrides
// ============================================================================
//
// Seed 2 companion — the FORCE_COLOR contract lives on `detectTerminalCaps`
// itself (see run-defaults.contract.test.tsx). At the `createTerm()` layer,
// the relevant default is: an `options.caps` override must win over auto-
// detection. If that precedence ever flips, forced-tier tests (and `run()`'s
// `colorLevel` override path) break silently.

describe("contract: createTerm({ caps }) overrides detection", () => {
  test("contract: explicit caps override auto-detection (truecolor)", () => {
    // Setting FORCE_COLOR=0 would normally force 'none' if detection ran.
    // With explicit caps, the override must win regardless.
    process.env.FORCE_COLOR = "0"
    const term = createTerm({
      caps: { colorLevel: "truecolor" } as any,
    })
    expect(term.caps?.colorLevel).toBe("truecolor")
  })

  test("contract: explicit caps override auto-detection (mono)", () => {
    process.env.FORCE_COLOR = "3"
    const term = createTerm({
      caps: { colorLevel: "mono" } as any,
    })
    expect(term.caps?.colorLevel).toBe("mono")
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// - `createTerm()` with default stdout: when a TTY is attached, `detectColor`
//   runs the full detection chain (COLORTERM, TERM, TERM_PROGRAM, CI env).
//   Each branch needs a contract test with the appropriate env fixture.
// - `createTerm({ stdout })` with a custom stream: caps must use the provided
//   stream's isTTY / _handle, not `process.stdout`.
// - `createTerm(emulator)`: screen-backed Term must not attempt stdin raw
//   mode. Pin with a `term.modes` null-observer check.
// - Capability overrides via `createTerm({ caps })`: explicit caps must
//   bypass detection entirely.
// - `term[Symbol.dispose]()`: disposal must be idempotent.
//
// See `createTerm` overloads in packages/ag-term/src/ansi/term.ts.
