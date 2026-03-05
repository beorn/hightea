/**
 * Tests for ETA calculation utilities
 */

import { describe, it, expect } from "vitest"
import { calculateETA, formatETA, getETA, createETATracker, DEFAULT_ETA_BUFFER_SIZE } from "../src/utils/eta.js"

describe("calculateETA", () => {
  it("returns null with insufficient samples", () => {
    expect(calculateETA([], 0, 100)).toBeNull()
    expect(calculateETA([{ time: 1000, value: 0 }], 0, 100)).toBeNull()
  })

  it("returns null when no progress made", () => {
    const buffer = [
      { time: 1000, value: 50 },
      { time: 2000, value: 50 },
    ]
    expect(calculateETA(buffer, 50, 100)).toBeNull()
  })

  it("returns null when no time elapsed", () => {
    const buffer = [
      { time: 1000, value: 0 },
      { time: 1000, value: 10 },
    ]
    expect(calculateETA(buffer, 10, 100)).toBeNull()
  })

  it("calculates ETA correctly", () => {
    // 10 items in 1 second = 10 items/sec
    // 90 remaining = 9 seconds
    const buffer = [
      { time: 1000, value: 0 },
      { time: 2000, value: 10 },
    ]
    const eta = calculateETA(buffer, 10, 100)
    expect(eta).toBe(9)
  })

  it("handles completion", () => {
    const buffer = [
      { time: 1000, value: 0 },
      { time: 2000, value: 100 },
    ]
    const eta = calculateETA(buffer, 100, 100)
    expect(eta).toBe(0)
  })
})

describe("formatETA", () => {
  it("formats null as --:--", () => {
    expect(formatETA(null)).toBe("--:--")
  })

  it("formats Infinity as --:--", () => {
    expect(formatETA(Infinity)).toBe("--:--")
  })

  it("formats NaN as --:--", () => {
    expect(formatETA(NaN)).toBe("--:--")
  })

  it("formats seconds only", () => {
    expect(formatETA(45)).toBe("0:45")
  })

  it("formats minutes and seconds", () => {
    expect(formatETA(90)).toBe("1:30")
    expect(formatETA(125)).toBe("2:05")
  })

  it("formats hours, minutes, and seconds", () => {
    expect(formatETA(3665)).toBe("1:01:05")
    expect(formatETA(7200)).toBe("2:00:00")
  })

  it("formats >24 hours as >1d", () => {
    expect(formatETA(86401)).toBe(">1d")
    expect(formatETA(100000)).toBe(">1d")
  })

  it("pads minutes and seconds", () => {
    expect(formatETA(61)).toBe("1:01")
    expect(formatETA(3601)).toBe("1:00:01")
  })
})

describe("getETA", () => {
  it("returns both seconds and formatted string", () => {
    const buffer = [
      { time: 1000, value: 0 },
      { time: 2000, value: 10 },
    ]
    const result = getETA(buffer, 10, 100)

    expect(result.seconds).toBe(9)
    expect(result.formatted).toBe("0:09")
  })

  it("handles insufficient data", () => {
    const result = getETA([], 0, 100)

    expect(result.seconds).toBeNull()
    expect(result.formatted).toBe("--:--")
  })
})

describe("createETATracker", () => {
  it("tracks samples and calculates ETA", () => {
    const tracker = createETATracker()

    // Simulate recording samples over time
    tracker.record(0)
    // Can't easily test timing, so just verify API works
    expect(tracker.getBuffer()).toHaveLength(1)
  })

  it("respects buffer size limit", () => {
    const tracker = createETATracker(3)

    tracker.record(0)
    tracker.record(10)
    tracker.record(20)
    tracker.record(30)

    expect(tracker.getBuffer()).toHaveLength(3)
  })

  it("uses default buffer size", () => {
    const tracker = createETATracker()

    for (let i = 0; i <= DEFAULT_ETA_BUFFER_SIZE + 5; i++) {
      tracker.record(i * 10)
    }

    expect(tracker.getBuffer()).toHaveLength(DEFAULT_ETA_BUFFER_SIZE)
  })

  it("reset clears buffer", () => {
    const tracker = createETATracker()

    tracker.record(0)
    tracker.record(10)
    tracker.reset()

    expect(tracker.getBuffer()).toHaveLength(0)
  })
})

describe("DEFAULT_ETA_BUFFER_SIZE", () => {
  it("is 10", () => {
    expect(DEFAULT_ETA_BUFFER_SIZE).toBe(10)
  })
})
