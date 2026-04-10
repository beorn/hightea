/**
 * usePasteCallback — subscribe to bracketed paste events.
 *
 * Simple callback-based paste hook for run() apps.
 * For component composition with PasteProvider, use usePaste() instead.
 *
 * @example
 * ```tsx
 * usePasteCallback((text) => {
 *   insertText(text)
 * })
 * ```
 */

import { useContext, useEffect, useRef } from "react"
import { RuntimeContext } from "../context"

export type PasteCallback = (text: string) => void

export function usePasteCallback(handler: PasteCallback): void {
  const rt = useContext(RuntimeContext)

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!rt) return
    return rt.on("paste", (text: string) => {
      handlerRef.current(text)
    })
  }, [rt])
}
