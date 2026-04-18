/**
 * Silvery useInput Hook
 *
 * Handles keyboard input via the unified RuntimeContext.
 * Compatible with Ink's useInput API.
 *
 * No-ops when called outside a runtime (e.g., in createRenderer() tests where
 * RuntimeContext is absent). Components render without input handling, which
 * is correct for static rendering.
 * Use useRuntime() for components that need to detect interactive vs static mode.
 */

import { useContext, useEffect, useRef } from "react"
import { ChainAppContext, RuntimeContext } from "../context"
import { isModifierOnlyEvent, type InputHandler, type Key } from "@silvery/ag/keys"

// ============================================================================
// Types
// ============================================================================

// Re-export Key and InputHandler for consumers that import from useInput
export type { Key, InputHandler } from "@silvery/ag/keys"

/**
 * Options for useInput hook.
 */
export interface UseInputOptions {
  /**
   * Enable or disable input handling.
   * Useful when there are multiple useInput hooks and you want to disable some.
   * @default true
   */
  isActive?: boolean

  /**
   * Callback for bracketed paste events.
   * When the terminal has bracketed paste mode enabled,
   * pasted text is delivered as a single string instead of
   * individual keystrokes.
   */
  onPaste?: (text: string) => void

  /**
   * Callback for key release events.
   * Requires Kitty protocol with REPORT_EVENTS flag enabled.
   * When provided, release events are dispatched here instead of being silently dropped.
   *
   * @example
   * ```tsx
   * useInput((input, key) => {
   *   // Handle press/repeat events
   * }, {
   *   onRelease: (input, key) => {
   *     // Handle release events (e.g., stop scrolling, end drag)
   *   },
   * })
   * ```
   */
  onRelease?: InputHandler
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for handling user input.
 *
 * No-ops if RuntimeContext is not provided (i.e., outside a runtime).
 * Components render normally without input handling in static mode.
 * Use useRuntime() for components that need to detect interactive vs static mode.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useInput((input, key) => {
 *     if (input === 'q') {
 *       // Quit
 *     }
 *     if (key.upArrow) {
 *       // Move up
 *     }
 *   }, {
 *     onRelease: (input, key) => {
 *       // Handle key release (requires Kitty REPORT_EVENTS)
 *     },
 *   });
 *
 *   return <Text>Press q to quit</Text>;
 * }
 * ```
 */
export function useInput(inputHandler: InputHandler, options: UseInputOptions = {}): void {
  // Prefer the apply-chain stores when present (root createApp); fall back
  // to RuntimeContext.on for isolated scopes like InputBoundary which still
  // ship a subscriber-list runtime without a chain.
  const chain = useContext(ChainAppContext)
  const rt = useContext(RuntimeContext)

  const { isActive = true, onPaste, onRelease } = options

  // Stable ref for the handler — avoids tearing down/recreating the
  // subscription on every render. Without this, rapid keystrokes between
  // effect cleanup and setup are lost.
  const handlerRef = useRef(inputHandler)
  handlerRef.current = inputHandler

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  const onReleaseRef = useRef(onRelease)
  onReleaseRef.current = onRelease

  // Subscribe to input events via the chain input store (preferred) or the
  // legacy RuntimeContext fallback. In static mode (no runtime, no chain),
  // this is a no-op.
  useEffect(() => {
    if (!isActive) return
    if (chain) {
      return chain.input.register((input, key) => {
        // Skip modifier-only keys (Cmd, Shift, Ctrl, Alt pressed alone).
        // Handled by useModifierKeys, not useInput consumers.
        if (isModifierOnlyEvent(input, key as Key)) return
        // Release events → onRelease if provided, otherwise dropped.
        if (key.eventType === "release") {
          onReleaseRef.current?.(input, key as Key)
          return
        }
        const result = handlerRef.current(input, key as Key)
        if (result === "exit") {
          // Route exit through the RuntimeContext (same as the legacy path).
          // The chain also emits an `exit` effect but the runner drains and
          // discards effects in commit-2 wiring; rt.exit() is the canonical
          // path until commit 3 moves to runEventBatch effect handling.
          rt?.exit()
          return "exit"
        }
        return undefined
      })
    }
    if (rt) {
      return rt.on("input", (input: string, key: Key) => {
        if (isModifierOnlyEvent(input, key)) return
        if (key.eventType === "release") {
          onReleaseRef.current?.(input, key)
          return
        }
        const result = handlerRef.current(input, key)
        if (result === "exit") rt.exit()
      })
    }
    return undefined
  }, [isActive, chain, rt])

  // Subscribe to paste events via the chain paste store (preferred) or the
  // legacy RuntimeContext fallback.
  useEffect(() => {
    if (!isActive) return
    if (chain) {
      return chain.paste.register((text) => {
        onPasteRef.current?.(text)
      })
    }
    if (rt) {
      return rt.on("paste", (text: string) => {
        onPasteRef.current?.(text)
      })
    }
    return undefined
  }, [isActive, chain, rt])
}
