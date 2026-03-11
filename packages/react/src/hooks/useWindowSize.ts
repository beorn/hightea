import { shallow, useTerm } from "./useTerm"

/**
 * Hook to get the current terminal window size.
 * Re-renders when the terminal is resized.
 *
 * Uses term.getState() which always returns defined values (defaults to 80x24),
 * unlike term.cols/rows which may be undefined for non-TTY streams.
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
  return useTerm((t) => {
    const s = t.getState()
    return { columns: s.cols, rows: s.rows }
  }, shallow)
}
