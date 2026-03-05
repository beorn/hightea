/**
 * Tests for Spinner class
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Spinner, SPINNER_FRAMES } from "../src/cli/spinner.js"

// Capture stdout at top level to cover all spinner tests
let originalWrite: typeof process.stdout.write
let output: string[]

beforeEach(() => {
  output = []
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any) => {
    output.push(String(chunk))
    return true
  }) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

describe("Spinner", () => {
  describe("SPINNER_FRAMES", () => {
    it("has frames for all styles", () => {
      expect(SPINNER_FRAMES.dots).toHaveLength(10)
      expect(SPINNER_FRAMES.line).toHaveLength(4)
      expect(SPINNER_FRAMES.arc).toHaveLength(6)
      expect(SPINNER_FRAMES.bounce).toHaveLength(4)
      expect(SPINNER_FRAMES.pulse).toHaveLength(6)
    })
  })

  describe("constructor", () => {
    it("accepts string as text", () => {
      const spinner = new Spinner("Loading")
      expect(spinner.currentText).toBe("Loading")
    })

    it("accepts options object", () => {
      const spinner = new Spinner({ text: "Loading", style: "arc" })
      expect(spinner.currentText).toBe("Loading")
    })

    it("uses defaults for missing options", () => {
      const spinner = new Spinner()
      expect(spinner.currentText).toBe("")
      expect(spinner.spinning).toBe(false)
    })
  })

  describe("start/stop", () => {
    it("starts and stops spinning", () => {
      const spinner = new Spinner("Test")
      expect(spinner.spinning).toBe(false)

      spinner.start()
      expect(spinner.spinning).toBe(true)

      spinner.stop()
      expect(spinner.spinning).toBe(false)
    })

    it("can update text while spinning", () => {
      const spinner = new Spinner("Initial")
      spinner.start()

      spinner.currentText = "Updated"
      expect(spinner.currentText).toBe("Updated")

      spinner.stop()
    })

    it("start accepts text parameter", () => {
      const spinner = new Spinner()
      spinner.start("New text")
      expect(spinner.currentText).toBe("New text")
      spinner.stop()
    })
  })

  describe("succeed/fail/warn/info", () => {
    it("succeed stops spinner", () => {
      const spinner = new Spinner("Loading")
      spinner.start()
      spinner.succeed("Done")
      expect(spinner.spinning).toBe(false)
      expect(output.join("")).toContain("Done")
    })

    it("fail stops spinner", () => {
      output = [] // Reset for this specific test
      const spinner = new Spinner("Loading")
      spinner.start()
      spinner.fail("Error")
      expect(spinner.spinning).toBe(false)
      expect(output.join("")).toContain("Error")
    })

    it("methods are chainable", () => {
      const spinner = new Spinner("Test")
      const result = spinner.start().stop()
      expect(result).toBe(spinner)
    })
  })

  describe("static start", () => {
    it("returns a stop function", () => {
      const stop = Spinner.start("Loading")
      expect(typeof stop).toBe("function")
      stop()
    })
  })
})
