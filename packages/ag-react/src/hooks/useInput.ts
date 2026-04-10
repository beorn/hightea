/**
 * Silvery useInput Hook
 *
 * Handles keyboard input via the unified RuntimeContext.
 * Compatible with Ink's useInput API.
 *
 * Throws if called outside a runtime (run(), render(), createApp(), test renderer).
 * Use useRuntime() for components that need to work in both static and interactive modes.
 */

import { useContext, useEffect, useRef } from "react"
import { RuntimeContext } from "../context"
import { isModifierOnlyEvent, type Key } from "@silvery/ag/keys"

// ============================================================================
// Types
// ============================================================================

// Re-export Key for consumers that import from useInput
export type { Key } from "@silvery/ag/keys"

/**
 * Input handler callback type.
 * Return "exit" to quit the app (calls rt.exit()).
 */
export type InputHandler = (input: string, key: Key) => void | "exit"

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
 * Throws if RuntimeContext is not provided (i.e., outside a runtime).
 * Use useRuntime() for components that work in both interactive and static modes.
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

  // Subscribe to input events via RuntimeContext
  // In static mode (no runtime), this is a no-op — components render
  // without input handling, which is correct for createRenderer() tests.
  useEffect(() => {
    if (!isActive || !rt) return

    return rt.on("input", (input: string, key: Key) => {
      // Skip modifier-only keys (Cmd, Shift, Ctrl, Alt pressed alone).
      // These are handled by useModifierKeys, not useInput consumers.
      if (isModifierOnlyEvent(input, key)) return
      // Release events are dispatched to onRelease if provided,
      // otherwise silently dropped (handlers expect press-only semantics).
      if (key.eventType === "release") {
        onReleaseRef.current?.(input, key)
        return
      }
      const result = handlerRef.current(input, key)
      if (result === "exit") rt.exit()
    })
  }, [isActive, rt])

  // Subscribe to paste events via RuntimeContext
  useEffect(() => {
    if (!isActive || !rt) return

    return rt.on("paste", (text: string) => {
      onPasteRef.current?.(text)
    })
  }, [isActive, rt])
}
