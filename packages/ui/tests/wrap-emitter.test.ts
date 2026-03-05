/**
 * Tests for wrapEmitter and waitForEvent
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"
import { wrapEmitter, waitForEvent } from "../src/wrappers/wrap-emitter.js"

// Helper to capture stdout output in tests
function captureStdout() {
  const output: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any) => {
    output.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  return {
    output,
    restore: () => {
      process.stdout.write = original
    },
  }
}

describe("wrapEmitter", () => {
  let emitter: EventEmitter
  let capture: ReturnType<typeof captureStdout>

  beforeEach(() => {
    emitter = new EventEmitter()
    capture = captureStdout()
  })

  afterEach(() => {
    capture.restore()
  })

  it("returns a stop function", () => {
    const stop = wrapEmitter(emitter, {
      events: {},
    })

    expect(typeof stop).toBe("function")
    stop()
  })

  it("accepts initialText", () => {
    const stop = wrapEmitter(emitter, {
      initialText: "Starting...",
      events: {},
    })

    stop()
  })

  it("registers event handlers", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        ready: { text: "Ready" },
        error: { fail: true },
      },
    })

    // Should have registered listeners
    expect(emitter.listenerCount("ready")).toBe(1)
    expect(emitter.listenerCount("error")).toBe(1)

    stop()
  })

  it("cleans up event handlers on stop", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        ready: { text: "Ready" },
        progress: { getText: (d) => `Progress: ${d}` },
      },
    })

    expect(emitter.listenerCount("ready")).toBe(1)
    expect(emitter.listenerCount("progress")).toBe(1)

    stop()

    expect(emitter.listenerCount("ready")).toBe(0)
    expect(emitter.listenerCount("progress")).toBe(0)
  })

  it("handles succeed event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        done: { succeed: true },
      },
    })

    emitter.emit("done")

    // After succeed, handlers should be cleaned up
    expect(emitter.listenerCount("done")).toBe(0)
  })

  it("handles fail event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        error: { fail: true },
      },
    })

    emitter.emit("error", new Error("Test error"))

    // After fail, handlers should be cleaned up
    expect(emitter.listenerCount("error")).toBe(0)
  })

  it("handles stop event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        idle: { stop: true },
      },
    })

    emitter.emit("idle")

    // After stop event, handlers should be cleaned up
    expect(emitter.listenerCount("idle")).toBe(0)
  })

  it("handles text update events", () => {
    const stop = wrapEmitter(emitter, {
      initialText: "Starting",
      events: {
        progress: { text: "In progress" },
      },
    })

    emitter.emit("progress")

    // Spinner should still be active (text update doesn't stop)
    expect(emitter.listenerCount("progress")).toBe(1)

    stop()
  })

  it("handles getText function", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        status: { getText: (data) => `Status: ${data}` },
      },
    })

    emitter.emit("status", "running")

    // Spinner should still be active
    expect(emitter.listenerCount("status")).toBe(1)

    stop()
  })

  it("handles Error objects in fail event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        error: { fail: true },
      },
    })

    const testError = new Error("Test error message")
    emitter.emit("error", testError)

    expect(emitter.listenerCount("error")).toBe(0)
  })

  it("handles non-Error values in fail event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        error: { fail: true },
      },
    })

    emitter.emit("error", "string error")

    expect(emitter.listenerCount("error")).toBe(0)
  })

  it("handles null/undefined in fail event", () => {
    const stop = wrapEmitter(emitter, {
      events: {
        error: { fail: true },
      },
    })

    emitter.emit("error", null)

    expect(emitter.listenerCount("error")).toBe(0)
  })
})

describe("waitForEvent", () => {
  let emitter: EventEmitter
  let capture: ReturnType<typeof captureStdout>

  beforeEach(() => {
    emitter = new EventEmitter()
    capture = captureStdout()
  })

  afterEach(() => {
    capture.restore()
  })

  it("resolves when event is emitted", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...")

    // Emit the event
    emitter.emit("ready", "data")

    const result = await promise
    expect(result).toBe("data")
  })

  it("cleans up listener after success", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...")

    emitter.emit("ready")

    await promise

    expect(emitter.listenerCount("ready")).toBe(0)
  })

  it("rejects on error event", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      errorEvent: "error",
    })

    emitter.emit("error", new Error("Test error"))

    await expect(promise).rejects.toThrow("Test error")
  })

  it("cleans up listeners after error", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      errorEvent: "error",
    })

    emitter.emit("error", new Error("Test"))

    try {
      await promise
    } catch {
      // Expected
    }

    expect(emitter.listenerCount("ready")).toBe(0)
    expect(emitter.listenerCount("error")).toBe(0)
  })

  it("rejects on timeout", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      timeout: 10,
    })

    await expect(promise).rejects.toThrow("Timeout waiting for ready")
  })

  it("cleans up listeners after timeout", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      timeout: 10,
    })

    try {
      await promise
    } catch {
      // Expected
    }

    expect(emitter.listenerCount("ready")).toBe(0)
  })

  it("handles non-Error values in error event", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      errorEvent: "error",
    })

    emitter.emit("error", "string error")

    await expect(promise).rejects.toThrow("string error")
  })

  it("clears timeout on success", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      timeout: 1000,
    })

    emitter.emit("ready", "done")

    const result = await promise
    expect(result).toBe("done")
  })

  it("clears timeout on error", async () => {
    const promise = waitForEvent(emitter, "ready", "Waiting...", {
      timeout: 1000,
      errorEvent: "error",
    })

    emitter.emit("error", new Error("fail"))

    await expect(promise).rejects.toThrow("fail")
  })
})
