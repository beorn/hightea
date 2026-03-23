/**
 * Silvery useStderr Hook
 *
 * Provides access to the stderr stream.
 * Compatible with Ink's useStderr API.
 */

import { useContext } from "react"
import { StderrContext } from "../context"

// ============================================================================
// Types
// ============================================================================

export interface UseStderrResult {
  /** The stderr stream */
  stderr: NodeJS.WriteStream
  /** Write to stderr */
  write: (data: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing the stderr stream.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { write } = useStderr();
 *
 *   useEffect(() => {
 *     write('Debug info\n');
 *   }, []);
 *
 *   return <Text>Check stderr</Text>;
 * }
 * ```
 */
export function useStderr(): UseStderrResult {
  const context = useContext(StderrContext)

  if (!context) {
    // Fall back to process.stderr when no provider is present
    return {
      stderr: process.stderr,
      write: (data: string) => {
        process.stderr.write(data)
      },
    }
  }

  return {
    stderr: context.stderr,
    write: context.write,
  }
}
