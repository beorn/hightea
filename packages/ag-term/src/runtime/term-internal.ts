/**
 * Internal accessor for raw stdin/stdout on a Term.
 *
 * The public `Term` interface (`../ansi/term.ts`) deliberately omits
 * `stdin` / `stdout`: direct stream access is the leak vector that produced
 * the 2026-04-22 `wasRaw` race class. Sub-owners (`term.input`, `term.output`,
 * `term.modes`, etc.) are the supported surface for every consumer.
 *
 * BUT: silvery's own `run()` adapter still has to thread raw streams into the
 * legacy `createApp.run()` option bag (`stdin: ReadStream`, `stdout: WriteStream`)
 * for the emulator + real-terminal paths. Until createApp grows a Term-aware
 * overload, this internal accessor is the single legitimate bridge.
 *
 * Usage is restricted to silvery's runtime/ directory by the lint rule
 * `packages/km-infra/scripts/check-stdin-ownership.sh` (km repo). External
 * callers that try to import this module can be flagged in CI.
 *
 * Bead: km-silvery.term-sub-owners (Phase 8b).
 */

import type { Term } from "../ansi/term"

/**
 * Internal shape — silvery runtime adapters only. Every Term factory in
 * `term.ts` (createNodeTerm, createHeadlessTerm, createBackendTerm) attaches
 * these fields on the underlying termBase object; they're just hidden from
 * the public `Term` interface so user code can't reach for them.
 */
export interface TermInternalStreams {
  readonly stdin: NodeJS.ReadStream
  readonly stdout: NodeJS.WriteStream
}

/**
 * Read the raw stdin/stdout streams a Term wraps. ONLY for silvery runtime
 * adapters that bridge to legacy stream-based APIs (createApp.run()'s option
 * bag). User code MUST go through sub-owners — see the Term interface.
 *
 * The cast is safe: every Term factory in `ansi/term.ts` populates these
 * fields on the underlying object before `finalizeTerm` proxies the public
 * surface; they're absent from the public interface only by editorial choice.
 */
export function getInternalStreams(term: Term): TermInternalStreams {
  return term as unknown as TermInternalStreams
}
