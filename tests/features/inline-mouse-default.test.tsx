/**
 * Inline mode mouse default — verifies that inline mode defaults to mouse: false.
 *
 * When mode is "inline", content lives in terminal scrollback where users expect
 * native terminal scrolling to work. SGR mouse tracking (mode 1006) captures
 * mouse events and disables native scrolling, so inline mode should default
 * to mouse: false.
 *
 * Tests run() with a mock stdout to observe whether mouse tracking sequences
 * are emitted.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { EventEmitter } from "node:events"
import { Text } from "../../src/index.js"
import { run } from "../../packages/term/src/runtime/run"

const MOUSE_ENABLE = "?1006h"

/** Create a mock WriteStream that captures output. */
function createMockStdout(cols = 40, rows = 10) {
  const chunks: string[] = []
  const emitter = new EventEmitter()

  const mock = Object.create(emitter)
  mock.columns = cols
  mock.rows = rows
  mock.isTTY = true
  mock.writable = true
  mock.fd = 1
  mock.write = function (data: string | Uint8Array) {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }
  mock.end = function () {}
  mock.destroy = function () {}
  // EventEmitter methods need to be accessible
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)

  return {
    stream: mock as NodeJS.WriteStream,
    get output() {
      return chunks.join("")
    },
  }
}

/** Create a mock ReadStream. */
function createMockStdin() {
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.isTTY = true
  mock.isRaw = false
  mock.fd = 0
  mock.setRawMode = function (mode: boolean) {
    mock.isRaw = mode
    return mock
  }
  mock.read = function () {
    return null
  }
  mock.resume = function () {
    return mock
  }
  mock.pause = function () {
    return mock
  }
  mock.ref = function () {
    return mock
  }
  mock.unref = function () {
    return mock
  }
  mock.setEncoding = function () {
    return mock
  }
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)

  return mock as NodeJS.ReadStream
}

describe("inline mode mouse default", () => {
  test("fullscreen mode enables mouse by default", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      kitty: false,
      focusReporting: false,
    })

    expect(stdout.output).toContain(MOUSE_ENABLE)
    handle.unmount()
  })

  test("inline mode disables mouse by default", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      mode: "inline",
      kitty: false,
      focusReporting: false,
    })

    expect(stdout.output).not.toContain(MOUSE_ENABLE)
    handle.unmount()
  })

  test("inline mode with explicit mouse: true enables mouse", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      mode: "inline",
      mouse: true,
      kitty: false,
      focusReporting: false,
    })

    expect(stdout.output).toContain(MOUSE_ENABLE)
    handle.unmount()
  })

  test("fullscreen mode with explicit mouse: false disables mouse", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      mouse: false,
      kitty: false,
      focusReporting: false,
    })

    expect(stdout.output).not.toContain(MOUSE_ENABLE)
    handle.unmount()
  })
})
