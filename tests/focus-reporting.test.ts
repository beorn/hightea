/**
 * Focus Reporting (CSI ?1004h) Tests
 */

import { describe, expect, test } from "vitest"
import {
  enableFocusReporting,
  disableFocusReporting,
  parseFocusEvent,
} from "../src/focus-reporting.js"

/** Capture all writes to a string */
function createCapture(): { write: (data: string) => void; output: () => string } {
  const chunks: string[] = []
  return {
    write: (data: string) => chunks.push(data),
    output: () => chunks.join(""),
  }
}

// ============================================================================
// Enable/Disable
// ============================================================================

describe("enableFocusReporting", () => {
  test("sends CSI ?1004h", () => {
    const cap = createCapture()
    enableFocusReporting(cap.write)
    expect(cap.output()).toBe("\x1b[?1004h")
  })
})

describe("disableFocusReporting", () => {
  test("sends CSI ?1004l", () => {
    const cap = createCapture()
    disableFocusReporting(cap.write)
    expect(cap.output()).toBe("\x1b[?1004l")
  })
})

// ============================================================================
// Parse Focus Events
// ============================================================================

describe("parseFocusEvent", () => {
  test("parses focus-in event (CSI I)", () => {
    expect(parseFocusEvent("\x1b[I")).toEqual({ type: "focus-in" })
  })

  test("parses focus-out event (CSI O)", () => {
    expect(parseFocusEvent("\x1b[O")).toEqual({ type: "focus-out" })
  })

  test("parses focus-in embedded in other data", () => {
    expect(parseFocusEvent("noise\x1b[Imore")).toEqual({ type: "focus-in" })
  })

  test("parses focus-out embedded in other data", () => {
    expect(parseFocusEvent("noise\x1b[Omore")).toEqual({ type: "focus-out" })
  })

  test("returns null for non-focus input", () => {
    expect(parseFocusEvent("regular input")).toBeNull()
  })

  test("returns null for empty string", () => {
    expect(parseFocusEvent("")).toBeNull()
  })

  test("returns null for partial CSI sequence", () => {
    expect(parseFocusEvent("\x1b[")).toBeNull()
  })

  test("returns null for other CSI sequences", () => {
    expect(parseFocusEvent("\x1b[A")).toBeNull()
  })

  test("focus-in takes priority when both present", () => {
    // In practice both won't appear in the same chunk, but test determinism
    const result = parseFocusEvent("\x1b[I\x1b[O")
    expect(result).toEqual({ type: "focus-in" })
  })
})
