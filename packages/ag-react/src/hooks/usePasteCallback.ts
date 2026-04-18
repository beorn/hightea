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
import { ChainAppContext, RuntimeContext } from "../context"

export type PasteCallback = (text: string) => void

export function usePasteCallback(handler: PasteCallback): void {
  const chain = useContext(ChainAppContext)
  const rt = useContext(RuntimeContext)

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (chain) {
      return chain.paste.register((text) => {
        handlerRef.current(text)
      })
    }
    if (rt) {
      return rt.on("paste", (text: string) => {
        handlerRef.current(text)
      })
    }
    return undefined
  }, [chain, rt])
}
