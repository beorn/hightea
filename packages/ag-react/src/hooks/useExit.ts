/**
 * useExit — programmatic exit hook.
 *
 * Thin wrapper over useApp().exit that throws outside a runtime
 * (unlike useApp which returns no-ops in static mode).
 *
 * Prefer `return "exit"` from useInput handlers when possible.
 * Use useExit() for imperative exit from event handlers, timers, etc.
 */

import { useContext } from "react"
import { RuntimeContext } from "../context"

/**
 * Returns a function that exits the app.
 * Throws if called outside a runtime (run(), createApp(), test renderer).
 */
export function useExit(): () => void {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error("useExit must be used within run() or createApp()")
  return rt.exit
}
