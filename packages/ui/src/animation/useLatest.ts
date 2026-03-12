/**
 * useLatest - Always-current ref to a value.
 *
 * The classic React pattern for avoiding stale closures in callbacks,
 * timers, and effects. Returns a ref whose `.current` is always the
 * latest value — safe to read from any async context.
 *
 * ```tsx
 * const countRef = useLatest(count)
 * useInterval(() => {
 *   console.log(countRef.current) // always fresh
 * }, 1000)
 * ```
 */

import { useRef } from "react"

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns a ref that always holds the latest value.
 *
 * Useful when a callback needs access to current state/props without
 * re-creating the callback (which would reset timers, event listeners, etc).
 *
 * @param value - The value to track
 * @returns A ref whose `.current` is always `value`
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}
