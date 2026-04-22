/**
 * @silvery/signals — Reactive signals for silvery.
 *
 * Thin wrapper around alien-signals providing:
 * - signal(value) — create a reactive value (call to read, call with arg to write)
 * - computed(fn) — derived reactive value that recomputes on dependency changes
 * - effect(fn) — side effect that re-runs when dependencies change
 * - effectScope(fn) — group effects for collective disposal
 * - batch(fn) — batch multiple signal updates into one notification
 *
 * @packageDocumentation
 */

export {
  signal,
  computed,
  effect,
  effectScope,
  startBatch,
  endBatch,
  trigger,
  isSignal,
  isComputed,
  isEffect,
  isEffectScope,
  getActiveSub,
  setActiveSub,
  getBatchDepth,
} from "alien-signals"

import { startBatch, endBatch } from "alien-signals"

/**
 * A reactive value — callable getter/setter.
 *
 * - `sig()` reads the current value (and subscribes the active effect/computed).
 * - `sig(next)` writes a new value; subscribers re-run only if `next !== current`.
 *
 * Matches the return shape of `signal<T>(initial)` from alien-signals, so any
 * `signal()` result is assignable to `Signal<T>`.
 */
export type Signal<T> = {
  (): T
  (value: T): void
}

/**
 * A read-only reactive value — callable getter that subscribes the active
 * effect/computed but cannot be written to. Matches the return shape of
 * `computed<T>(fn)` from alien-signals.
 */
export type ReadSignal<T> = () => T

/** Batch multiple signal updates, notifying subscribers once at the end. */
export function batch(fn: () => void): void {
  startBatch()
  try {
    fn()
  } finally {
    endBatch()
  }
}
