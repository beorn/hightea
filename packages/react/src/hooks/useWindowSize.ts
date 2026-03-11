import { useCallback, useSyncExternalStore } from "react"
import { useTerm } from "./useTerm"

/**
 * Hook to get the current terminal window size.
 * Re-renders when the terminal is resized.
 *
 * @example
 * ```tsx
 * import { useWindowSize, Box, Text } from '@silvery/react'
 *
 * function StatusBar() {
 *   const { columns, rows } = useWindowSize()
 *   return <Text>{`${columns}x${rows}`}</Text>
 * }
 * ```
 */
export function useWindowSize(): { columns: number; rows: number } {
  const term = useTerm()

  const subscribe = useCallback((listener: () => void) => term.subscribe(listener), [term])

  const getSnapshot = useCallback(() => {
    const { cols, rows } = term.getState()
    return `${cols}x${rows}`
  }, [term])

  // useSyncExternalStore needs a stable snapshot for identity comparison.
  // We serialize to a string so resizes trigger re-renders.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [columns, rows] = snapshot.split("x").map(Number)

  return { columns, rows }
}
