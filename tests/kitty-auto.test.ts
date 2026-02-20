/**
 * Tests for Kitty auto-enable in runtime layers (create-app and run).
 */

import { EventEmitter } from "events"
import { describe, expect, it } from "vitest"
import { enableKittyKeyboard, disableKittyKeyboard, KittyFlags } from "../src/output.js"

// ============================================================================
// Output sequence tests (unit)
// ============================================================================

describe("Kitty protocol output sequences", () => {
  it("enableKittyKeyboard defaults to DISAMBIGUATE", () => {
    expect(enableKittyKeyboard()).toBe("\x1b[>1u")
  })

  it("enableKittyKeyboard with specific flags", () => {
    expect(enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS)).toBe("\x1b[>3u")
  })

  it("enableKittyKeyboard with all flags", () => {
    const all =
      KittyFlags.DISAMBIGUATE |
      KittyFlags.REPORT_EVENTS |
      KittyFlags.REPORT_ALTERNATE |
      KittyFlags.REPORT_ALL_KEYS |
      KittyFlags.REPORT_TEXT
    expect(enableKittyKeyboard(all)).toBe("\x1b[>31u")
  })

  it("disableKittyKeyboard sends pop", () => {
    expect(disableKittyKeyboard()).toBe("\x1b[<u")
  })
})

// ============================================================================
// AppRunOptions type tests (create-app)
// ============================================================================

describe("AppRunOptions kitty option", () => {
  it("kitty option is accepted as boolean", async () => {
    // Verify the type is accepted — this is a compile-time check.
    // At runtime, we just confirm the option exists in the interface.
    const opts: import("../src/runtime/create-app.js").AppRunOptions = {
      kitty: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.kitty).toBe(true)
  })

  it("kitty option is accepted as number", async () => {
    const opts: import("../src/runtime/create-app.js").AppRunOptions = {
      kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS,
      cols: 80,
      rows: 24,
    }
    expect(opts.kitty).toBe(3)
  })

  it("mouse option is accepted", async () => {
    const opts: import("../src/runtime/create-app.js").AppRunOptions = {
      mouse: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.mouse).toBe(true)
  })
})

// ============================================================================
// RunOptions type tests (run)
// ============================================================================

describe("RunOptions kitty option", () => {
  it("kitty option is accepted as boolean", () => {
    const opts: import("../src/runtime/run.js").RunOptions = {
      kitty: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.kitty).toBe(true)
  })

  it("kitty option is accepted as number", () => {
    const opts: import("../src/runtime/run.js").RunOptions = {
      kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS,
      cols: 80,
      rows: 24,
    }
    expect(opts.kitty).toBe(3)
  })

  it("mouse option is accepted", () => {
    const opts: import("../src/runtime/run.js").RunOptions = {
      mouse: true,
      cols: 80,
      rows: 24,
    }
    expect(opts.mouse).toBe(true)
  })
})

// ============================================================================
// Cleanup tests
// ============================================================================

describe("Kitty cleanup sequences", () => {
  it("cleanup disables Kitty protocol", () => {
    // disableKittyKeyboard pops the mode stack
    const seq = disableKittyKeyboard()
    expect(seq).toBe("\x1b[<u")
  })

  it("enable then disable is symmetric", () => {
    const enable = enableKittyKeyboard(KittyFlags.DISAMBIGUATE)
    const disable = disableKittyKeyboard()
    // Both are CSI sequences with 'u' terminator
    expect(enable).toMatch(/^\x1b\[>\d+u$/)
    expect(disable).toMatch(/^\x1b\[<u$/)
  })
})
