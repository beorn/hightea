/**
 * run() - Layer 2 entry point for silvery-loop
 *
 * Thin wrapper over createApp() for simple React apps with keyboard input.
 * Use this when you want React component state (useState, useEffect)
 * with simple keyboard input via useInput().
 *
 * For stores and providers, use createApp() (Layer 3) directly.
 *
 * @example
 * ```tsx
 * import { run, useInput } from '@silvery/term/runtime'
 *
 * function Counter() {
 *   const [count, setCount] = useState(0)
 *
 *   useInput((input, key) => {
 *     if (input === 'j') setCount(c => c + 1)
 *     if (key.upArrow) setCount(c => c + 1)
 *     if (input === 'q') return 'exit'
 *   })
 *
 *   return <Text>Count: {count}</Text>
 * }
 *
 * await run(<Counter />)
 * ```
 */

import { useContext, useEffect, type ReactElement } from "react"

import { RuntimeContext } from "@silvery/react/context"
import { createApp } from "./create-app"
import type { Key, InputHandler } from "./keys"
import type { Term } from "../ansi/term"

// Re-export types from keys.ts
export type { Key, InputHandler } from "./keys"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for run().
 */
export interface RunOptions {
  /** Terminal dimensions (default: from process.stdout) */
  cols?: number
  rows?: number
  /** Standard output (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /** Abort signal for external cleanup */
  signal?: AbortSignal
  /**
   * Enable Kitty keyboard protocol.
   * - `true`: auto-detect and enable with DISAMBIGUATE flag (1)
   * - number: enable with specific KittyFlags bitfield
   * - `false`/undefined: don't enable (default)
   */
  kitty?: boolean | number
  /**
   * Enable SGR mouse tracking (mode 1006).
   * Default: false
   */
  mouse?: boolean
  /**
   * Render mode: fullscreen (alt screen, default) or inline (scrollback-compatible).
   */
  mode?: "fullscreen" | "inline"
  /**
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * - `true`: force enable
   * - `"auto"`: enable if terminal likely supports it
   * - `false`/undefined: disabled (default)
   */
  textSizing?: boolean | "auto"
  /**
   * Terminal capabilities for width measurement and output suppression.
   */
  caps?: import("../terminal-caps.js").TerminalCaps
  /**
   * Handle Ctrl+Z by suspending the process. Default: true
   */
  suspendOnCtrlZ?: boolean
  /**
   * Handle Ctrl+C by restoring terminal and exiting. Default: true
   */
  exitOnCtrlC?: boolean
  /** Called before suspend. Return false to prevent. */
  onSuspend?: () => boolean | void
  /** Called after resume from suspend. */
  onResume?: () => void
  /** Called on Ctrl+C. Return false to prevent exit. */
  onInterrupt?: () => boolean | void
}

/**
 * Handle returned by run() for controlling the app.
 */
export interface RunHandle {
  /** Current rendered text (no ANSI) */
  readonly text: string
  /** Wait until the app exits */
  waitUntilExit(): Promise<void>
  /** Unmount and cleanup */
  unmount(): void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Send a key press */
  press(key: string): Promise<void>
}

/** Paste handler callback type */
export type PasteHandler = (text: string) => void

// ============================================================================
// Hooks (Layer 2 — uses RuntimeContext, works in both run() and createApp())
// ============================================================================

/**
 * Hook for handling keyboard input.
 *
 * Layer 2 variant: supports returning 'exit' from the handler to exit the app.
 * For the standard hook (isActive, onPaste options), import from 'silvery'.
 *
 * @example
 * ```tsx
 * useInput((input, key) => {
 *   if (input === 'q') return 'exit'
 *   if (key.upArrow) moveCursor(-1)
 *   if (key.downArrow) moveCursor(1)
 * })
 * ```
 */
export function useInput(handler: InputHandler): void {
  const rt = useContext(RuntimeContext)

  useEffect(() => {
    if (!rt) return
    return rt.on("input", (input: string, key: Key) => {
      const result = handler(input, key)
      if (result === "exit") rt.exit()
    })
  }, [rt, handler])
}

/**
 * Hook for programmatic exit.
 */
export function useExit(): () => void {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error("useExit must be used within run() or createApp()")
  return rt.exit
}

/**
 * Hook for handling bracketed paste events.
 */
export function usePaste(handler: PasteHandler): void {
  const rt = useContext(RuntimeContext)

  useEffect(() => {
    if (!rt) return
    return rt.on("paste", handler)
  }, [rt, handler])
}

// ============================================================================
// run() — thin wrapper over createApp()
// ============================================================================

/**
 * Run a React component with the silvery-loop runtime.
 *
 * Accepts either a Term instance or RunOptions:
 * - `run(<App />, term)` — Term handles streams, createApp handles rendering
 * - `run(<App />, { cols, rows, ... })` — classic options API
 *
 * Internally delegates to createApp() with an empty store.
 * For stores and providers, use createApp() directly.
 */
export async function run(element: ReactElement, term: Term): Promise<RunHandle>
export async function run(element: ReactElement, options?: RunOptions): Promise<RunHandle>
export async function run(element: ReactElement, optionsOrTerm: RunOptions | Term = {}): Promise<RunHandle> {
  // Term path: pass Term as provider + its streams
  if (isTerm(optionsOrTerm)) {
    const term = optionsOrTerm as Term
    const app = createApp(() => () => ({}))
    const handle = await app.run(element, {
      term,
      stdout: term.stdout,
      stdin: term.stdin,
      cols: term.cols ?? undefined,
      rows: term.rows ?? undefined,
      caps: term.caps,
      alternateScreen: true,
    })
    return wrapHandle(handle)
  }

  // Options path: map RunOptions to AppRunOptions
  const { mode, ...rest } = optionsOrTerm as RunOptions
  const app = createApp(() => () => ({}))
  const handle = await app.run(element, {
    ...rest,
    alternateScreen: mode !== "inline",
  })
  return wrapHandle(handle)
}

/** Duck-type check: Term has getState and events as functions */
function isTerm(obj: unknown): obj is Term {
  if (typeof obj !== "object" || obj === null) return false
  const o = obj as Record<string, unknown>
  return typeof o.getState === "function" && typeof o.events === "function"
}

/** Wrap AppHandle as RunHandle (subset of the full handle). */
function wrapHandle(handle: {
  readonly text: string
  waitUntilExit(): Promise<void>
  unmount(): void
  [Symbol.dispose](): void
  press(key: string): Promise<void>
}): RunHandle {
  return {
    get text() {
      return handle.text
    },
    waitUntilExit: () => handle.waitUntilExit(),
    unmount: () => handle.unmount(),
    [Symbol.dispose]: () => handle[Symbol.dispose](),
    press: (key: string) => handle.press(key),
  }
}
