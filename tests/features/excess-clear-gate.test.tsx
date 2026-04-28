/**
 * Structural invariant: clearExcessArea cannot be invoked from a second-pass
 * dispatch site (sticky/absolute/overlap-forced), because the only way to
 * obtain an ExcessClearGate is through requireExcessClearGate, which returns
 * null when hasPrevBuffer === false.
 *
 * This test promotes the runtime guard at silvery 168b4989 (the
 * `&& hasPrevBuffer` term in `needsExcessClear`) to a STRUCTURAL invariant:
 * the wrong-order call site (the bug class km-silvery.ai-chat-incremental-mismatch
 * + fuzz nested seed=1337) is unrepresentable in the type system.
 *
 * Tracking: km-silvery.paint-clear-invariant.
 */

import { describe, expect, test } from "vitest"
import {
  type ExcessClearGate,
  requireExcessClearGate,
} from "@silvery/ag-term/pipeline/render-phase"

describe("excess-clear gate — structural invariant for clearExcessArea", () => {
  // Sample layout used in second-pass-style preconditions.
  const samplePrev = { x: 0, y: 0, width: 5, height: 5 }

  test("first-pass with prev buffer → gate is granted", () => {
    const gate = requireExcessClearGate(
      /* bufferIsCloned */ true,
      /* layoutChanged */ true,
      /* prevLayout */ samplePrev,
      /* hasPrevBuffer */ true,
    )
    expect(gate).not.toBeNull()
    expect(gate?.prevLayout).toBe(samplePrev)
  })

  test("second-pass dispatch (hasPrevBuffer=false) → gate denied", () => {
    // This is the case the runtime guard at silvery 168b4989 protected:
    // a sticky/absolute/overlap-forced child rendering on top of fresh
    // first-pass sibling paints. clearExcessArea would corrupt those.
    const gate = requireExcessClearGate(
      /* bufferIsCloned */ true,
      /* layoutChanged */ true,
      /* prevLayout */ samplePrev,
      /* hasPrevBuffer */ false,
    )
    expect(gate).toBeNull()
  })

  test("fresh buffer (no clone) → gate denied", () => {
    const gate = requireExcessClearGate(false, true, samplePrev, true)
    expect(gate).toBeNull()
  })

  test("layout did not change → gate denied", () => {
    const gate = requireExcessClearGate(true, false, samplePrev, true)
    expect(gate).toBeNull()
  })

  test("no prevLayout (first render of a node) → gate denied", () => {
    const gate = requireExcessClearGate(true, true, null, true)
    expect(gate).toBeNull()
  })

  test("type-level: ExcessClearGate brand cannot be forged", () => {
    // The brand symbol is `declare const ... unique symbol` — runtime-absent,
    // which means the only way to obtain a value of type ExcessClearGate is
    // through requireExcessClearGate. Any external attempt to construct
    // {} as ExcessClearGate forces a structural-type cast (assertion), which
    // PR review can spot. There is no implicit conversion path.
    const fake = {} as ExcessClearGate
    // The cast compiles, but the value is empty — at runtime, accessing
    // .prevLayout would yield undefined. This test documents that the
    // brand's safety is "no implicit construction" + "obvious cast required",
    // not "impossible to bypass via assertion".
    expect((fake as { prevLayout?: unknown }).prevLayout).toBeUndefined()
  })

  test("type-level: requireExcessClearGate signature pins all four preconditions", () => {
    // @ts-expect-error — bufferIsCloned is required.
    requireExcessClearGate(undefined, true, samplePrev, true)

    // @ts-expect-error — layoutChanged is required.
    requireExcessClearGate(true, undefined, samplePrev, true)

    // @ts-expect-error — hasPrevBuffer is required.
    requireExcessClearGate(true, true, samplePrev, undefined)

    // prevLayout permits null/undefined (a fresh-mounted node has no prev),
    // so this overload is intentionally NOT a type error:
    requireExcessClearGate(true, true, null, true)
  })
})
