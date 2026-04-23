import { shallow, useTerm } from "./useTerm"

/**
 * Hook to get the current terminal window size.
 * Re-renders when the terminal is resized.
 *
 * Reads from `term.size` (the Size sub-owner) — always returns defined values
 * via the Size owner's default (80x24 for non-TTY streams).
 *
 * @example
 * ```tsx
 * import { useWindowSize, Box, Text } from '@silvery/ag-react'
 *
 * function StatusBar() {
 *   const { columns, rows } = useWindowSize()
 *   return <Text>{`${columns}x${rows}`}</Text>
 * }
 * ```
 */
export function useWindowSize(): { columns: number; rows: number } {
  return useTerm((t) => ({ columns: t.size.cols(), rows: t.size.rows() }), shallow)
}
