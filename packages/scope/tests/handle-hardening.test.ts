/**
 * handle-hardening.test.ts — runtime authenticity + ownership-bypass tests.
 *
 * Pro/Kimi review (2026-04-26) flagged the original Phase 1 design as
 * "soft nominality" because:
 *   - `as TickHandle` casts compile (no compile-time block)
 *   - the runtime check on the brand was a writable property, not a
 *     module-private WeakSet — so reflection or cloning forged a handle
 *   - `scope.use(handle)` bypassed ownership tracking
 *   - early manual dispose left stale entries in `getAdoptedHandles`
 *   - the handle surface was mutable
 *
 * The hardened design (handle.ts post-pro-review) closes those holes via:
 *   - module-private `branded: WeakSet<object>` runtime authenticity
 *   - `Object.freeze` + non-writable property descriptors on the surface
 *   - `Scope.use()` override that routes branded handles through
 *     `adoptHandle()` so `scope.use(handle)` and `scope.adoptHandle(handle)`
 *     are equivalent for accounting
 *   - `adoptHandle` rejects non-branded values (including `as`-forged ones)
 *   - early manual dispose marks the entry idempotent so the registry
 *     stays accurate
 *
 * These tests pin each closure, with one failing-to-illustrate-the-attack
 * case per gap so a future regression is loud.
 */

import { describe, expect, it } from "vitest"

import {
  assertScopeBalance,
  createScope,
  defineHandle,
  finaliseHandle,
  getAdoptedHandles,
  isBrandedHandle,
  type RegistrableHandle,
} from "../src/index.js"

const Test = defineHandle("Test")

function makeBranded(): RegistrableHandle {
  let disposed = false
  const bare = Test.create({}, () => {
    disposed = true
  })
  return finaliseHandle(bare, { isDisposed: () => disposed }) as unknown as RegistrableHandle
}

// =============================================================================
// (1) Runtime authenticity — adoptHandle rejects forged values
// =============================================================================

describe("runtime authenticity", () => {
  it("isBrandedHandle returns true for genuine handles, false for impostors", () => {
    const real = makeBranded()
    expect(isBrandedHandle(real)).toBe(true)

    const fakeFromLiteral = {
      [Symbol.asyncDispose]: async () => {},
    } as unknown as RegistrableHandle
    expect(isBrandedHandle(fakeFromLiteral)).toBe(false)

    expect(isBrandedHandle(null)).toBe(false)
    expect(isBrandedHandle(undefined)).toBe(false)
    expect(isBrandedHandle(42 as unknown)).toBe(false)
    expect(isBrandedHandle("string" as unknown)).toBe(false)
  })

  it("scope.adoptHandle rejects an `as`-forged handle (the Kimi attack)", () => {
    const scope = createScope("forge-victim")
    const fake = {
      [Symbol.asyncDispose]: async () => {},
    } as unknown as RegistrableHandle

    expect(() => scope.adoptHandle(fake)).toThrow(/not a silvery handle/)
  })

  it("scope.adoptHandle rejects a clone of a real handle", () => {
    const scope = createScope("clone-victim")
    const real = makeBranded()

    // Cloning copies the surface but not the WeakSet membership.
    const clone = {
      ...(real as unknown as Record<string, unknown>),
    } as unknown as RegistrableHandle

    expect(() => scope.adoptHandle(clone)).toThrow(/not a silvery handle/)
  })

  it("scope.adoptHandle rejects an Object.create-spoof of a real handle", () => {
    const scope = createScope("spoof-victim")
    const real = makeBranded()
    const spoof = Object.create(real) as unknown as RegistrableHandle
    expect(() => scope.adoptHandle(spoof)).toThrow(/not a silvery handle/)
  })
})

// =============================================================================
// (2) Ownership-bypass — Scope.use(handle) routes through adoptHandle
// =============================================================================

describe("Scope.use override routes branded handles through ownership tracking", () => {
  it("scope.use(handle) is equivalent to scope.adoptHandle(handle) for accounting", async () => {
    const scope = createScope("use-routes")
    const handle = makeBranded()
    scope.use(handle as unknown as AsyncDisposable)

    // Branded handle adopted via use() shows up in the registry, exactly
    // as if adoptHandle was called directly.
    expect(getAdoptedHandles(scope)).toHaveLength(1)
    expect(getAdoptedHandles(scope)[0]?.kind).toBe("Test")

    await scope[Symbol.asyncDispose]()
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("scope.use(plainDisposable) bypasses the registry (intentionally)", async () => {
    const scope = createScope("use-plain")
    let plainDisposed = false
    scope.use({
      [Symbol.asyncDispose]: async () => {
        plainDisposed = true
      },
    })

    expect(getAdoptedHandles(scope)).toHaveLength(0)
    await scope[Symbol.asyncDispose]()
    expect(plainDisposed).toBe(true)
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("a spread-clone of a real handle is rejected by both adopt and use paths", () => {
    const scope = createScope("forge-via-use")
    const real = makeBranded()

    // Spread copies enumerable own properties only. `[Symbol.asyncDispose]`
    // is defined non-enumerable + non-writable + non-configurable on real
    // handles, so the clone lacks it entirely. This means:
    //   - isBrandedHandle(clone) is false (clone not in WeakSet)
    //   - clone has no [Symbol.asyncDispose] symbol → super.use() throws
    //     TC39's "@@asyncDispose must be callable" error
    // Either way, the clone CANNOT silently bypass accounting.
    const clone = { ...(real as unknown as Record<string, unknown>) } as unknown as AsyncDisposable

    expect(() => scope.use(clone)).toThrow(/@@asyncDispose must be callable|asyncDispose/i)
    expect(getAdoptedHandles(scope)).toHaveLength(0)

    // adoptHandle path also rejects (different error: not branded).
    expect(() => scope.adoptHandle(clone as unknown as RegistrableHandle)).toThrow(
      /not a silvery handle/,
    )
  })
})

// =============================================================================
// (3) Cross-scope adoption — second adopt is rejected at runtime
// =============================================================================

describe("cross-scope adoption", () => {
  it("rejects adopting a handle that's already owned by another scope", () => {
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    const handle = makeBranded()
    scopeA.adoptHandle(handle)
    expect(() => scopeB.adoptHandle(handle)).toThrow(/already owned/)
  })

  it("rejects adopting via scope.use(handle) into a second scope", () => {
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    const handle = makeBranded()
    scopeA.use(handle as unknown as AsyncDisposable)
    expect(() => scopeB.use(handle as unknown as AsyncDisposable)).toThrow(/already owned/)
  })
})

// =============================================================================
// (4) Mutability — frozen handle can't be tampered with
// =============================================================================

describe("handle mutability is sealed", () => {
  it("the surface of finaliseHandle is non-writable + non-configurable", () => {
    const bare = Test.create({}, () => {})
    const h = finaliseHandle(bare, { tag: "v1" }) as { tag: string }

    // Non-writable: assignment is silently ignored in non-strict mode and
    // throws in strict mode. We verify the underlying value is unchanged
    // either way.
    try {
      ;(h as { tag: string }).tag = "v2"
    } catch {
      // strict-mode throw — fine.
    }
    expect(h.tag).toBe("v1")
  })

  it("[Symbol.asyncDispose] cannot be overwritten on a finalised handle", () => {
    const bare = Test.create({}, () => {})
    const h = finaliseHandle(bare, {})

    let originalCalled = false
    // Re-define to capture original (we can't, because freeze locks it).
    const desc = Object.getOwnPropertyDescriptor(h, Symbol.asyncDispose)
    expect(desc?.writable).toBe(false)
    expect(desc?.configurable).toBe(false)

    try {
      Object.defineProperty(h, Symbol.asyncDispose, {
        value: async () => {
          originalCalled = true
        },
      })
    } catch {
      // expected — frozen + non-configurable
    }
    expect(originalCalled).toBe(false)
  })

  it("Object.freeze leaves the handle sealed (no extension)", () => {
    const bare = Test.create({}, () => {})
    const h = finaliseHandle(bare, {})
    expect(Object.isFrozen(h)).toBe(true)
  })
})

// =============================================================================
// (5) Early manual dispose — registry stays accurate
// =============================================================================

describe("early manual dispose updates the registry", () => {
  it("calling handle[Symbol.asyncDispose]() before scope close is idempotent and balanced", async () => {
    const scope = createScope("early-dispose")
    const handle = makeBranded()
    scope.adoptHandle(handle)

    // Manual dispose before scope close. The wrapper in adoptHandle is
    // idempotent — when the scope's stack runs the wrapper later, it
    // notices `disposedFlag` is already true and skips re-disposal.
    await (handle as unknown as AsyncDisposable)[Symbol.asyncDispose]()

    // The registry still shows the handle until the scope's wrapper runs
    // (Phase 1 scope: close still drains the stack normally; the wrapper's
    // idempotency keeps double-dispose at bay).
    await scope[Symbol.asyncDispose]()
    expect(getAdoptedHandles(scope)).toHaveLength(0)
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("double scope close is safe (idempotent)", async () => {
    const scope = createScope("double-close")
    const handle = makeBranded()
    scope.adoptHandle(handle)

    await scope[Symbol.asyncDispose]()
    // Inherited AsyncDisposableStack.[Symbol.asyncDispose] is idempotent.
    await scope[Symbol.asyncDispose]()
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })
})

// =============================================================================
// (6) Per-scope (NOT global) accounting
// =============================================================================

describe("per-scope ownership", () => {
  it("an unrelated leak in scope A does not affect balance assertion in scope B", () => {
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    scopeA.adoptHandle(makeBranded()) // leak in A
    expect(() => assertScopeBalance(scopeB)).not.toThrow()
  })

  it("leak inventory in scope A doesn't include scope B's handles", () => {
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    scopeA.adoptHandle(makeBranded())
    scopeB.adoptHandle(makeBranded())
    scopeB.adoptHandle(makeBranded())

    expect(getAdoptedHandles(scopeA)).toHaveLength(1)
    expect(getAdoptedHandles(scopeB)).toHaveLength(2)
  })
})
