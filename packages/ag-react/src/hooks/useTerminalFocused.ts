/**
 * useTerminalFocused — track terminal window focus state.
 *
 * Returns whether the terminal window is currently focused. Updates reactively
 * when the terminal receives CSI I (focus-in) or CSI O (focus-out) events.
 *
 * Requires `focusReporting: true` in the run() options. Without it, this hook
 * always returns `true` (optimistic default — assumes the terminal is focused).
 *
 * @example
 * ```tsx
 * function InputBox() {
 *   const terminalFocused = useTerminalFocused()
 *   return (
 *     <TextInput
 *       borderColor={terminalFocused ? "$focusborder" : "$border"}
 *       isActive={terminalFocused}
 *     />
 *   )
 * }
 * ```
 */

import { useContext, useEffect, useState } from "react"
import { ChainAppContext } from "../context"
import { useRuntime } from "./useRuntime"

/**
 * Track whether the terminal window is focused.
 *
 * Returns `true` when the terminal has focus, `false` when it doesn't.
 * Always returns `true` if focus reporting is not enabled (safe default).
 */
export function useTerminalFocused(): boolean {
  const [focused, setFocused] = useState(true)
  const chain = useContext(ChainAppContext)
  const rt = useRuntime()

  useEffect(() => {
    if (chain) {
      return chain.focusEvents.register((isFocused) => {
        setFocused(isFocused)
      })
    }
    if (rt) {
      return rt.on("focus", (isFocused: boolean) => {
        setFocused(isFocused)
      })
    }
    return undefined
  }, [chain, rt])

  return focused
}
