/**
 * Regression: Console (tap) and Output (sink) coexist on the shared
 * ConsoleRouter regardless of activation order.
 *
 * Pro review 2026-04-22 P0-3: the prior independent-patcher design dropped
 * Console's tap whenever Output activated after Console captured. The
 * structural fix — one ConsoleRouter that both owners register against —
 * removes the order dependency.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createConsoleRouter } from "../../packages/ag-term/src/runtime/devices/console-router"
import { createConsole } from "../../packages/ag-term/src/runtime/devices/console"
import { createOutput } from "../../packages/ag-term/src/runtime/devices/output"

function stubConsoleTarget() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const stub: Partial<globalThis.Console> & Record<string, unknown> = {}
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    stub[method] = (...args: unknown[]) => {
      calls.push({ method, args })
    }
  }
  return { stub: stub as globalThis.Console, calls }
}

describe("Console tap + Output sink coexistence (ConsoleRouter)", () => {
  // Output's deactivate/dispose flushes the stderr buffer through
  // process.stderr.write. Patch it to a test-local capture so vitest's
  // stderr-leak guard doesn't fail the test when the flush happens.
  let origStderrWrite: typeof process.stderr.write
  let origDebugLog: string | undefined

  beforeEach(() => {
    origStderrWrite = process.stderr.write
    origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG
    process.stderr.write = (() => true) as typeof process.stderr.write
  })

  afterEach(() => {
    process.stderr.write = origStderrWrite
    if (origDebugLog !== undefined) process.env.DEBUG_LOG = origDebugLog
  })

  test("Console capture FIRST, Output activate SECOND — tap still fires", () => {
    const { stub } = stubConsoleTarget()
    using router = createConsoleRouter(stub)
    using consoleOwner = createConsole(stub, router)
    using output = createOutput(undefined, router)

    consoleOwner.capture({ suppress: false })
    output.activate({ bufferStderr: true })

    stub.log("hello")

    // Tap recorded the call.
    expect(consoleOwner.entries()).toHaveLength(1)
    expect(consoleOwner.entries()[0]).toMatchObject({ method: "log", args: ["hello"] })

    consoleOwner.restore()
    output.deactivate()
  })

  test("Output activate FIRST, Console capture SECOND — tap still fires", () => {
    const { stub } = stubConsoleTarget()
    using router = createConsoleRouter(stub)
    using consoleOwner = createConsole(stub, router)
    using output = createOutput(undefined, router)

    output.activate({ bufferStderr: true })
    consoleOwner.capture({ suppress: false })

    stub.log("world")

    expect(consoleOwner.entries()).toHaveLength(1)
    expect(consoleOwner.entries()[0]).toMatchObject({ method: "log", args: ["world"] })

    consoleOwner.restore()
    output.deactivate()
  })

  test("Console suppress: true overrides — original isn't called", () => {
    const { stub, calls } = stubConsoleTarget()
    using router = createConsoleRouter(stub)
    using consoleOwner = createConsole(stub, router)
    using output = createOutput(undefined, router)

    consoleOwner.capture({ suppress: true })
    output.activate({ bufferStderr: true })

    stub.log("hushed")

    // Tap saw it.
    expect(consoleOwner.entries()).toHaveLength(1)
    // Original forward did not fire (suppressed).
    expect(calls).toEqual([])

    consoleOwner.restore()
    output.deactivate()
  })
})
