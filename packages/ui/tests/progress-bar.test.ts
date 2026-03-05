/**
 * Tests for ProgressBar class
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ProgressBar } from "../src/cli/progress-bar.js"

// Capture stdout to silence progress bar output
let originalWrite: typeof process.stdout.write

beforeEach(() => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

describe("ProgressBar", () => {
  describe("constructor", () => {
    it("uses default values", () => {
      const bar = new ProgressBar()
      expect(bar.ratio).toBe(0)
      expect(bar.percentage).toBe(0)
    })

    it("accepts total option", () => {
      const bar = new ProgressBar({ total: 50 })
      bar.start(25)
      expect(bar.ratio).toBe(0.5)
      expect(bar.percentage).toBe(50)
    })
  })

  describe("update", () => {
    it("updates current value", () => {
      const bar = new ProgressBar({ total: 100 })
      bar.start(0)
      bar.update(50)
      expect(bar.percentage).toBe(50)
      bar.stop(true)
    })

    it("clamps to total", () => {
      const bar = new ProgressBar({ total: 100 })
      bar.start(0)
      bar.update(150)
      expect(bar.percentage).toBe(100)
      bar.stop(true)
    })
  })

  describe("increment", () => {
    it("increments by 1 by default", () => {
      const bar = new ProgressBar({ total: 10 })
      bar.start(0)
      bar.increment()
      expect(bar.percentage).toBe(10)
      bar.stop(true)
    })

    it("increments by custom amount", () => {
      const bar = new ProgressBar({ total: 100 })
      bar.start(0)
      bar.increment(25)
      expect(bar.percentage).toBe(25)
      bar.stop(true)
    })
  })

  describe("setPhase", () => {
    it("updates phase and can reset progress", () => {
      const bar = new ProgressBar({
        total: 100,
        phases: { scan: "Scanning", process: "Processing" },
      })
      bar.start(0)
      bar.update(100)

      bar.setPhase("process", { current: 0, total: 50 })
      expect(bar.percentage).toBe(0)

      bar.update(25)
      expect(bar.percentage).toBe(50)
      bar.stop(true)
    })
  })

  describe("ratio and percentage", () => {
    it("calculates ratio correctly", () => {
      const bar = new ProgressBar({ total: 200 })
      bar.start(100)
      expect(bar.ratio).toBe(0.5)
      expect(bar.percentage).toBe(50)
      bar.stop(true)
    })

    it("handles zero total", () => {
      const bar = new ProgressBar({ total: 0 })
      bar.start(0)
      expect(bar.ratio).toBe(0)
      expect(bar.percentage).toBe(0)
      bar.stop(true)
    })
  })
})
