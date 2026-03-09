/**
 * Ink-compatible renderToString helper using silvery's renderStringSync.
 *
 * silvery's buffer output wraps content with SGR reset (\x1b[0m) at start/end.
 * Ink does not do this, so we strip the leading/trailing resets to match Ink's output.
 */
import { renderStringSync } from "@silvery/react/render-string"
import { ensureDefaultLayoutEngine, isLayoutEngineInitialized } from "@silvery/term/layout-engine"

type RenderToStringOptions = {
  columns?: number
}

let engineReady = false

async function ensureEngine(): Promise<void> {
  if (engineReady || isLayoutEngineInitialized()) {
    engineReady = true
    return
  }
  await ensureDefaultLayoutEngine()
  engineReady = true
}

/**
 * Strip the leading/trailing SGR reset that silvery adds to buffer output.
 * This makes output match Ink's renderToString behavior.
 */
function stripBufferResets(s: string): string {
  // silvery wraps output with \x1b[0m at start and end
  let result = s
  if (result.startsWith("\x1b[0m")) result = result.slice(4)
  if (result.endsWith("\x1b[0m")) result = result.slice(0, -4)
  return result
}

/**
 * Synchronous render to string (requires layout engine to be initialized).
 */
export const renderToString = (node: React.JSX.Element, options?: RenderToStringOptions): string => {
  if (!isLayoutEngineInitialized()) {
    throw new Error("Layout engine not initialized. Call initLayoutEngine() in beforeAll().")
  }
  return stripBufferResets(
    renderStringSync(node, {
      width: options?.columns ?? 100,
    }),
  )
}

/**
 * Async render to string (auto-initializes layout engine).
 */
export const renderToStringAsync = async (
  node: React.JSX.Element,
  options?: RenderToStringOptions,
): Promise<string> => {
  await ensureEngine()
  return stripBufferResets(
    renderStringSync(node, {
      width: options?.columns ?? 100,
    }),
  )
}

/**
 * Initialize the layout engine (call in beforeAll).
 */
export const initLayoutEngine = ensureEngine
