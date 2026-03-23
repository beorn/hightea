/**
 * useMouseCursor — set the terminal mouse cursor shape.
 *
 * Uses OSC 22 to change the mouse pointer appearance. Resets to default
 * on unmount or when the shape changes to null/undefined.
 *
 * @example
 * ```tsx
 * function DraggableHandle() {
 *   const [hovered, setHovered] = useState(false)
 *   useMouseCursor(hovered ? "move" : null)
 *   return <Box onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
 *     <Text>Drag me</Text>
 *   </Box>
 * }
 * ```
 */

import { useEffect, useContext } from "react"
import { TermContext } from "../context"
import { setMouseCursorShape, resetMouseCursorShape } from "@silvery/ag-term/output"
import type { MouseCursorShape } from "@silvery/ag-term/output"

/**
 * Set the terminal mouse cursor shape. Resets on unmount or shape change.
 * Pass null/undefined to use the default cursor.
 */
export function useMouseCursor(shape: MouseCursorShape | null | undefined): void {
  const term = useContext(TermContext)

  useEffect(() => {
    if (!shape || !term) return
    term.write(setMouseCursorShape(shape))
    return () => {
      term.write(resetMouseCursorShape())
    }
  }, [shape, term])
}
