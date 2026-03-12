/**
 * In-process replacement for ink's PTY-based term() and run() test helpers.
 *
 * Instead of spawning fixtures as subprocesses via node-pty, this renders
 * fixture components directly using silvery's compat render() with a mock
 * stdin/stdout. Tests use the same API: write(), output, waitForExit().
 *
 * This enables PTY tests to run in CI without node-pty dependencies.
 */

import { EventEmitter } from "node:events"
import React from "react"
import createStdout from "./create-stdout"
import { render } from "../../../../packages/compat/src/ink"

// =============================================================================
// Mock stdin — emulates a TTY for raw mode support
// =============================================================================

class MockStdin extends EventEmitter {
  isTTY = true as const
  isRaw = false
  setRawMode(mode: boolean) {
    this.isRaw = mode
    return this
  }
  ref() {
    return this
  }
  unref() {
    return this
  }
  resume() {
    return this
  }
  pause() {
    return this
  }
  read() {
    return null
  }
}

// =============================================================================
// Fixture interface
// =============================================================================

export interface FixtureSpec {
  element: React.ReactElement
  options?: Record<string, unknown>
}

// =============================================================================
// termFixture — replaces ink's term() helper
// =============================================================================

/**
 * Render a fixture component in-process with mock stdin/stdout.
 * Returns the same interface as ink's term() PTY helper:
 * - write(input) — send raw bytes to stdin
 * - output — accumulated stdout output + exit messages
 * - waitForExit() — wait for the app to exit
 */
export function termFixture(fixture: FixtureSpec, cols = 100) {
  const stdout = createStdout(cols) as any
  const stdin = new MockStdin()

  const app = render(fixture.element, {
    stdout,
    stdin: stdin as any,
    exitOnCtrlC: false,
    ...fixture.options,
  })

  const exitOutput: string[] = []

  return {
    write(input: string) {
      stdin.emit("data", input)
    },
    get output() {
      return stdout.getWrites().join("") + exitOutput.join("")
    },
    async waitForExit() {
      try {
        const result = await app.waitUntilExit()
        if (result !== undefined && result !== null) {
          if (typeof result === "object" && "message" in (result as object)) {
            exitOutput.push(`result:${(result as { message: string }).message}\n`)
          } else {
            exitOutput.push(`result:${String(result)}\n`)
          }
        }
        exitOutput.push("exited\n")
      } catch (err: unknown) {
        exitOutput.push(`${(err as Error).message}\n`)
      }
    },
  }
}

// =============================================================================
// runFixture — replaces ink's run() helper (non-interactive)
// =============================================================================

/**
 * Render a fixture component and wait for it to exit.
 * Returns the accumulated output string, like ink's run() helper.
 */
export async function runFixture(fixture: FixtureSpec, cols = 100): Promise<string> {
  const stdout = createStdout(cols) as any
  const stdin = new MockStdin()

  const app = render(fixture.element, {
    stdout,
    stdin: stdin as any,
    ...fixture.options,
  })

  try {
    const result = await app.waitUntilExit()
    let output = stdout.getWrites().join("")
    if (result !== undefined && result !== null) {
      if (typeof result === "object" && "message" in (result as object)) {
        output += `result:${(result as { message: string }).message}\n`
      } else {
        output += `result:${String(result)}\n`
      }
    }
    output += "exited\n"
    return output
  } catch (err: unknown) {
    return stdout.getWrites().join("") + `${(err as Error).message}\n`
  }
}
