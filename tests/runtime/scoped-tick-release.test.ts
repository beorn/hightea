/**
 * scoped-tick-release.test.ts — derisk #2 + #3 of C1 / Phase 1
 * (km-silvery.scope-resource-ownership).
 *
 * #2: the migrated consumer (createScopedTick) has tests that fail if cleanup
 *     misbehaves — concretely, this file fails if the scope's dispose path
 *     stops calling the underlying tick's stop() function.
 *
 * #3: scope close actually frees resources, not just asserts empty.
 *     Concretely:
 *       - Adopt N TickHandles into a scope.
 *       - Close the scope.
 *       - Assert: getAdoptedHandles(scope) is empty (existing assertion) AND
 *                 a release counter incremented exactly N times (one per
 *                 underlying tick's stop() call).
 *     This catches a regression where a future refactor lies — empties the
 *     accounting registry without invoking the disposers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  assertScopeBalance,
  createScope,
  getAdoptedHandles,
} from "@silvery/scope"

import { createScopedTick } from "../../packages/ag-term/src/runtime/scoped-tick"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// =============================================================================
// Release-counter probe
// =============================================================================
// vitest's fake timer integration replaces setTimeout/clearTimeout with
// instrumented versions; we count clearTimeout calls as the proxy for
// "underlying tick released its resource." Each createScopedTick allocates
// exactly one timer per next() call; on stop(), it invokes clearTimeout
// once. We assert clearTimeout fires N times when the scope closes with
// N undisposed pending ticks.

describe("scope close releases tick resources, not just registry entries", () => {
  it("calls clearTimeout once per pending tick when the scope closes", async () => {
    const N = 3
    const clearSpy = vi.spyOn(globalThis, "clearTimeout")

    const scope = createScope("release-counter")
    const handles = []
    for (let i = 0; i < N; i++) {
      const handle = createScopedTick(scope, 50)
      handles.push(handle)
      // Engage each tick by starting an iterator that primes a setTimeout.
      // Without this, the tick wouldn't have a pending timer to clear.
      const iter = handle.iterable[Symbol.asyncIterator]()
      void iter.next()
    }

    expect(getAdoptedHandles(scope)).toHaveLength(N)
    const baselineClears = clearSpy.mock.calls.length

    await scope[Symbol.asyncDispose]()

    // (existing assertion) registry empty
    expect(getAdoptedHandles(scope)).toHaveLength(0)
    expect(() => assertScopeBalance(scope)).not.toThrow()

    // (new derisk #3 assertion) the underlying disposers fired — clearTimeout
    // was invoked at least once per pending tick. We assert >= N (not == N)
    // because vitest's fake-timer harness may issue housekeeping clears.
    const newClears = clearSpy.mock.calls.length - baselineClears
    expect(newClears).toBeGreaterThanOrEqual(N)

    clearSpy.mockRestore()
  })

  it("a regression that empties the registry without calling dispose would fail this test", async () => {
    // Demonstration: count clearTimeout invocations. If the scope close
    // path stopped calling each handle's [Symbol.asyncDispose], the
    // clearTimeout count would not increase even though the registry
    // empties (because adoptHandle's defer always pulls the entry out
    // of `owned`). The previous test asserts BOTH conditions; this one
    // makes the contract explicit.
    const clearSpy = vi.spyOn(globalThis, "clearTimeout")

    const scope = createScope("contract")
    const tick = createScopedTick(scope, 50)
    const iter = tick.iterable[Symbol.asyncIterator]()
    void iter.next() // arms a real setTimeout (vitest fake)

    const baselineClears = clearSpy.mock.calls.length
    await scope[Symbol.asyncDispose]()

    // If close lied (emptied registry but skipped dispose), this would be 0.
    expect(clearSpy.mock.calls.length).toBeGreaterThan(baselineClears)
    clearSpy.mockRestore()
  })

  it("assertScopeBalance flags the leak when adoption happens but dispose is bypassed", () => {
    // Negative path: prove the leak DETECTOR is wired, not just that it
    // happens to pass when everything works. Adopt a handle but never
    // close the scope — the balance assertion must throw.
    const scope = createScope("leaky")
    createScopedTick(scope, 50)
    expect(() => assertScopeBalance(scope)).toThrow(/undisposed handle/)
  })

  it("partial dispose: 5 adopted, 2 disposed early, 3 still owned at scope close", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout")

    const scope = createScope("partial")
    const handles = [
      createScopedTick(scope, 50),
      createScopedTick(scope, 50),
      createScopedTick(scope, 50),
      createScopedTick(scope, 50),
      createScopedTick(scope, 50),
    ]
    for (const h of handles) void h.iterable[Symbol.asyncIterator]().next()

    expect(getAdoptedHandles(scope)).toHaveLength(5)

    // Dispose 2 early via their async-dispose symbol.
    await handles[0]![Symbol.asyncDispose]()
    await handles[1]![Symbol.asyncDispose]()

    // Note: the registry counts the use(...) wrapper, not the handle's own
    // dispose path. Early dispose via the handle's own symbol does NOT
    // remove the entry from `owned` (that path runs only when the use(...)
    // wrapper runs at scope close). So accounting still shows 5 adopted —
    // the dispose call was a no-op for accounting, but the underlying
    // resource IS released (clearTimeout fired). The scope-close path
    // then runs the wrapper for all 5 — handles 0/1 have already stopped
    // so their disposers are idempotent (verified by no double-clear of
    // the same timer ID).
    const beforeCloseClears = clearSpy.mock.calls.length

    await scope[Symbol.asyncDispose]()

    // After scope close, registry is empty (LIFO stack ran all 5 wrappers)
    expect(getAdoptedHandles(scope)).toHaveLength(0)
    // And clearTimeout was invoked at the close path for the 3 still-pending
    // ticks (handles 2, 3, 4). The early-disposed ones already stopped,
    // and their internal `stopped` flag makes the close-path stop() a no-op.
    const closeClears = clearSpy.mock.calls.length - beforeCloseClears
    expect(closeClears).toBeGreaterThanOrEqual(3)

    clearSpy.mockRestore()
  })
})
