/**
 * Tests for wrapper utilities
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { withSpinner, attachSpinner } from "../src/wrappers/with-spinner.js"
import { withProgress, createProgressCallback } from "../src/wrappers/with-progress.js"
import { wrapGenerator } from "../src/wrappers/wrap-generator.js"
import type { ProgressCallback } from "../src/types.js"

// Capture stdout at top level to cover all progress/spinner tests
let originalWrite: typeof process.stdout.write

beforeEach(() => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

describe("withSpinner", () => {
  it("resolves with the promise result", async () => {
    const result = await withSpinner(Promise.resolve(42), "Loading", {
      clearOnComplete: true,
    })
    expect(result).toBe(42)
  })

  it("accepts a function that returns a promise", async () => {
    const result = await withSpinner(() => Promise.resolve("hello"), "Loading", {
      clearOnComplete: true,
    })
    expect(result).toBe("hello")
  })

  it("rejects if promise rejects", async () => {
    await expect(
      withSpinner(Promise.reject(new Error("fail")), "Loading", {
        clearOnComplete: true,
      }),
    ).rejects.toThrow("fail")
  })
})

describe("attachSpinner", () => {
  it("returns promise and spinner", async () => {
    const [promise, spinner] = attachSpinner(Promise.resolve("result"), "Loading")

    expect(spinner.spinning).toBe(true)
    const result = await promise
    expect(result).toBe("result")
  })
})

describe("withProgress", () => {
  it("calls the function with progress callback", async () => {
    const calls: Array<{ phase?: string; current: number; total: number }> = []

    await withProgress(
      async (onProgress: ProgressCallback) => {
        onProgress({ current: 0, total: 10 })
        calls.push({ current: 0, total: 10 })
        onProgress({ current: 10, total: 10 })
        calls.push({ current: 10, total: 10 })
        return "done"
      },
      { clearOnComplete: true },
    )

    expect(calls).toHaveLength(2)
  })

  it("handles phases", async () => {
    await withProgress(
      async (onProgress: ProgressCallback) => {
        onProgress({ phase: "scan", current: 0, total: 5 })
        onProgress({ phase: "scan", current: 5, total: 5 })
        onProgress({ phase: "process", current: 0, total: 10 })
        onProgress({ phase: "process", current: 10, total: 10 })
      },
      {
        phases: { scan: "Scanning", process: "Processing" },
        clearOnComplete: true,
      },
    )
  })
})

describe("createProgressCallback", () => {
  it("returns callback and complete function", () => {
    const [callback, complete] = createProgressCallback({
      clearOnComplete: true,
    })

    expect(typeof callback).toBe("function")
    expect(typeof complete).toBe("function")

    callback({ current: 50, total: 100 })
    complete()
  })
})

describe("wrapGenerator", () => {
  it("consumes generator and shows progress", async () => {
    function* gen() {
      yield { current: 0, total: 3 }
      yield { current: 1, total: 3 }
      yield { current: 2, total: 3 }
      yield { current: 3, total: 3 }
      return "done"
    }

    const result = await wrapGenerator(gen(), "Processing", {
      clearOnComplete: true,
    })
    expect(result).toBe("done")
  })
})
