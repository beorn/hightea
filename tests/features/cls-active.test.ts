/**
 * CLS Active Recorder — module-level pipeline integration surface.
 *
 * Tests the contract that the pipeline (layout-phase.ts) and the termless
 * capture API rely on: a single global "currently capturing" recorder,
 * set/cleared around begin/end windows, never silently shared.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import { afterEach, describe, expect, test } from "vitest"
import {
  clearActiveCLSRecorder,
  getActiveCLSRecorder,
  setActiveCLSRecorder,
} from "@silvery/ag/cls-active"
import { createCLSRecorder } from "@silvery/ag/cls-recorder"

afterEach(() => {
  // Defensive cleanup — every test must end with no active recorder.
  clearActiveCLSRecorder()
})

describe("CLS active-recorder registry", () => {
  test("starts null — no recorder active by default", () => {
    expect(getActiveCLSRecorder()).toBeNull()
  })

  test("set + get round-trips the same reference", () => {
    const r = createCLSRecorder()
    setActiveCLSRecorder(r)
    expect(getActiveCLSRecorder()).toBe(r)
  })

  test("clear resets to null", () => {
    const r = createCLSRecorder()
    setActiveCLSRecorder(r)
    clearActiveCLSRecorder()
    expect(getActiveCLSRecorder()).toBeNull()
  })

  test("set throws when another recorder is already active (double-capture guard)", () => {
    const r1 = createCLSRecorder()
    const r2 = createCLSRecorder()
    setActiveCLSRecorder(r1)
    expect(() => setActiveCLSRecorder(r2)).toThrow(/already active/)
    expect(getActiveCLSRecorder()).toBe(r1) // r1 still active, r2 not silently swapped
  })

  test("clear is idempotent — safe on fresh / already-cleared state", () => {
    clearActiveCLSRecorder()
    clearActiveCLSRecorder()
    expect(getActiveCLSRecorder()).toBeNull()
  })

  test("after clear, a new recorder can be set", () => {
    const r1 = createCLSRecorder()
    setActiveCLSRecorder(r1)
    clearActiveCLSRecorder()

    const r2 = createCLSRecorder()
    setActiveCLSRecorder(r2)
    expect(getActiveCLSRecorder()).toBe(r2)
  })
})
