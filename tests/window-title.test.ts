/**
 * OSC 2/0 Window Title Tests
 */

import { Writable } from "node:stream"
import { describe, expect, test } from "vitest"
import { setWindowTitle, setWindowAndIconTitle, resetWindowTitle } from "../src/output.js"

/** Create a mock stdout that captures writes */
function createMockStdout(): NodeJS.WriteStream & { written: string } {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  }) as NodeJS.WriteStream & { written: string }

  Object.defineProperty(stream, "written", {
    get: () => chunks.join(""),
  })

  return stream
}

describe("Window Title (OSC 2/0)", () => {
  describe("setWindowTitle", () => {
    test("generates correct OSC 2 sequence", () => {
      const stdout = createMockStdout()
      setWindowTitle(stdout, "km — My Board")
      expect(stdout.written).toBe("\x1b]2;km — My Board\x07")
    })

    test("handles empty title", () => {
      const stdout = createMockStdout()
      setWindowTitle(stdout, "")
      expect(stdout.written).toBe("\x1b]2;\x07")
    })

    test("handles unicode in title", () => {
      const stdout = createMockStdout()
      setWindowTitle(stdout, "km — 日本語タスク")
      expect(stdout.written).toBe("\x1b]2;km — 日本語タスク\x07")
    })

    test("handles special characters", () => {
      const stdout = createMockStdout()
      setWindowTitle(stdout, "km — Task: Fix bugs & improve tests")
      expect(stdout.written).toBe("\x1b]2;km — Task: Fix bugs & improve tests\x07")
    })
  })

  describe("setWindowAndIconTitle", () => {
    test("generates correct OSC 0 sequence", () => {
      const stdout = createMockStdout()
      setWindowAndIconTitle(stdout, "km — My Board")
      expect(stdout.written).toBe("\x1b]0;km — My Board\x07")
    })

    test("handles empty title", () => {
      const stdout = createMockStdout()
      setWindowAndIconTitle(stdout, "")
      expect(stdout.written).toBe("\x1b]0;\x07")
    })
  })

  describe("resetWindowTitle", () => {
    test("generates correct empty OSC 2 sequence", () => {
      const stdout = createMockStdout()
      resetWindowTitle(stdout)
      expect(stdout.written).toBe("\x1b]2;\x07")
    })
  })
})
