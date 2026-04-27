/**
 * scope-handle-prevention.test-types.ts — type-level canary for the C1 /
 * Phase 1 brand seal on `TickHandle` (km-silvery.scope-resource-ownership).
 *
 * This file is a **negative type test**. It uses `@ts-expect-error` to assert
 * that specific lines BELOW must fail to compile. As long as
 * `npx tsc --noEmit` exits 0, the directives are firing — i.e., the brand
 * seal is intact.
 *
 * If a future refactor weakens the brand (e.g., removes the `unique symbol`
 * tag or exports the handle constructor), the lines below will start
 * compiling, the `@ts-expect-error` directives will themselves error
 * ("Unused @ts-expect-error directive" / TS2578), and `tsc` will fail.
 *
 * The `.test-types.ts` extension keeps this file out of the runtime
 * vitest suite (vitest globs `.test.ts` / `.spec.ts` / `.test.tsx` etc.,
 * not `.test-types.ts`). It is picked up by `tsc --noEmit` over the
 * vendor source tree.
 *
 * Sabotage proof (2026-04-26): removing the directive on line 35 below
 * caused tsc to emit TS2322 on line 38, confirming the brand seal is
 * structural rather than ceremonial. The directive was then restored.
 *
 * Bead: km-silvery.lifecycle-leak-detection (recast: scope-resource-ownership)
 */

import { createScope } from "@silvery/scope"
import { createScopedTick, type TickHandle } from "../src/runtime/scoped-tick"

// =============================================================================
// (1) Forge attempt: object literal assigned directly to TickHandle.
// The unique-symbol brand on Handle<typeof Tick.brand> is module-private; the
// only way to produce one is via the Tick.create() call inside scoped-tick.ts.
// =============================================================================

// @ts-expect-error — TickHandle carries a module-private unique-symbol brand
// that cannot be produced outside scoped-tick.ts. Object literals fail with
// TS2322 because the synthetic value lacks the brand property.
const fakeFromLiteral: TickHandle = {
  iterable: {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true as const, value: undefined }),
    }),
  },
  emitted: () => 0,
  [Symbol.asyncDispose]: async () => {},
}

// =============================================================================
// (2) Forge attempt: function returning a TickHandle without going through
// the factory.
// =============================================================================

function forgedFactory(): TickHandle {
  // @ts-expect-error — same reason: cannot synthesise the unique-symbol
  // brand outside scoped-tick.ts. The return statement fails with TS2322.
  return {
    iterable: {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true as const, value: undefined }),
      }),
    },
    emitted: () => 0,
    [Symbol.asyncDispose]: async () => {},
  }
}

// =============================================================================
// (3) Factory requires a Scope token — calling without one fails with
// TS2554 (expected 2 arguments, got 0/1).
// =============================================================================

// @ts-expect-error — createScopedTick(scope, intervalMs) requires both
// arguments. Omitting `scope` proves the type-level scope-token requirement.
const missingScope: TickHandle = createScopedTick()

// @ts-expect-error — passing only the interval (forgetting the scope token)
// also fails with TS2554. The scope token is positional and non-optional.
const missingScope2: TickHandle = createScopedTick(100)

// =============================================================================
// (4) Wrong type for scope argument fails — only `Scope` instances qualify.
// =============================================================================

// @ts-expect-error — the first parameter is typed `Scope`, not `AbortSignal`
// or any other lifecycle primitive. Passing the wrong type fails with TS2345.
const wrongScopeType: TickHandle = createScopedTick(new AbortController().signal, 100)

// =============================================================================
// Use the bindings so unused-variable lints don't trip on the negative test.
// =============================================================================

void fakeFromLiteral
void forgedFactory
void missingScope
void missingScope2
void wrongScopeType

// =============================================================================
// Positive path — happy case must compile cleanly. If this errors, the
// factory signature has regressed.
// =============================================================================

const scope = createScope("type-test")
const _validHandle: TickHandle = createScopedTick(scope, 100)
void _validHandle
