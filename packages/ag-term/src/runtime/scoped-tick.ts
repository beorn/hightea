/**
 * scoped-tick.ts — first consumer of the C1 / Phase 1 handle pattern,
 * hardened per pro/Kimi review (2026-04-26).
 *
 * `createScopedTick(scope, intervalMs)` returns an opaque `TickHandle`
 * (defined via `@silvery/scope`'s `defineHandle()` brand) and is registered
 * into `scope` so it auto-disposes when the scope closes. Per-scope handle
 * accounting catches the case where the consumer holds the handle past its
 * intended lifetime — `assertScopeBalance(scope)` flags it as a leak.
 *
 * Two-layer defense (see `@silvery/scope/handle.ts` for full design):
 *   - **Compile-time**: the `Handle<unique symbol>` brand prevents
 *     accidental object-literal construction (TS2322). Doesn't stop
 *     `as`-cast escapes — that's an acknowledged limit, addressed by lint.
 *   - **Runtime**: the handle's identity is recorded in a module-private
 *     `WeakSet` inside `@silvery/scope`. `adoptHandle()` and the wrapped
 *     `Scope.use()` reject any value that isn't in the set. Forged values
 *     fail at the library boundary.
 *
 * The handle is `Object.freeze`d via `finaliseHandle` before return, so
 * its surface (`iterable`, `emitted`, `[Symbol.asyncDispose]`) cannot be
 * overwritten by callers.
 *
 * Why this exists alongside `createTick(intervalMs, signal?)`:
 *   - `createTick` takes an optional `AbortSignal` and a caller can forget
 *     to wire it; the resulting tick source leaks the underlying setTimeout
 *     until process exit.
 *   - `createScopedTick` requires a `Scope` token at the type level. The
 *     factory is the only path to a `TickHandle` value that the runtime
 *     authenticity gate accepts.
 *
 * @packageDocumentation
 */

import { defineHandle, finaliseHandle, type Handle, type Scope } from "@silvery/scope"

// =============================================================================
// Brand — module-private. The unique-symbol brand is never exported, and
// the runtime authenticity is in @silvery/scope's `branded` WeakSet.
// =============================================================================

const Tick = defineHandle("Tick")

// Recover the `unique symbol` brand type from the factory's return shape so
// `TickHandle` can name it. The runtime symbol stays inside @silvery/scope.
type TickBrand = ReturnType<typeof Tick.create> extends Handle<infer B> ? B : never

/**
 * Opaque handle for a scope-owned tick source. Treat as opaque outside
 * this module — read `iterable` to async-iterate, `emitted()` for the
 * count. Disposal is automatic on scope close; manual `await using` works.
 *
 * The brand `TickBrand` is module-private; external callers cannot
 * construct a `TickHandle` from an object literal (compile-time TS2322),
 * and forged values via `as TickHandle` are rejected at runtime by
 * `adoptHandle()` / `Scope.use()`.
 */
export type TickHandle = Handle<TickBrand> & {
  /** Async-iterate emitted tick numbers (0, 1, 2, …). Frozen / non-writable. */
  readonly iterable: AsyncIterable<number>
  /** Snapshot the count of ticks emitted so far. Frozen / non-writable. */
  readonly emitted: () => number
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a scope-owned tick source.
 *
 * @param scope The scope that owns the tick's lifetime. When the scope
 *              disposes (or `[Symbol.asyncDispose]()` is called manually),
 *              the underlying `setTimeout` is cancelled and any pending
 *              iterator settles with `done: true`.
 * @param intervalMs Interval between ticks in milliseconds.
 *
 * @example
 * ```ts
 * await using scope = createScope("anim")
 * const tick = createScopedTick(scope, 16) // ~60fps frame tick
 * for await (const n of tick.iterable) {
 *   if (n >= 60) break
 * }
 * ```
 */
export function createScopedTick(scope: Scope, intervalMs: number): TickHandle {
  let count = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: ((r: IteratorResult<number>) => void) | undefined
  let stopped = false

  function stop() {
    if (stopped) return
    stopped = true
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending) {
      pending({ done: true, value: undefined })
      pending = undefined
    }
  }

  // Cascade abort from the owning scope's signal. This sits on `defer`, not
  // on a separate listener pair, so it disposes in LIFO with the rest of
  // the scope's teardown.
  if (scope.signal.aborted) {
    stopped = true
  } else {
    const onAbort = () => stop()
    scope.signal.addEventListener("abort", onAbort, { once: true })
    scope.defer(() => scope.signal.removeEventListener("abort", onAbort))
  }

  const iterable: AsyncIterable<number> = {
    [Symbol.asyncIterator](): AsyncIterator<number> {
      return {
        next(): Promise<IteratorResult<number>> {
          if (stopped) return Promise.resolve({ done: true, value: undefined })
          return new Promise<IteratorResult<number>>((resolve) => {
            pending = resolve
            timer = setTimeout(() => {
              if (stopped) {
                resolve({ done: true, value: undefined })
                return
              }
              const value = count++
              pending = undefined
              resolve({ done: false, value })
            }, intervalMs)
          })
        },
        return(): Promise<IteratorResult<number>> {
          stop()
          return Promise.resolve({ done: true, value: undefined })
        },
      }
    },
  }

  // Brand → finalise (attach surface + freeze) → adopt. The factory in
  // @silvery/scope/handle.ts records the bare handle in `branded`; the
  // factory module then attaches surface and freezes via finaliseHandle.
  const bare = Tick.create({ iterable, emitted: () => count }, () => stop())
  const handle = finaliseHandle(bare, {
    iterable,
    emitted: () => count,
  }) as TickHandle

  scope.adoptHandle(handle)
  return handle
}
