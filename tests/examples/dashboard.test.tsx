/**
 * Dashboard example — structural snapshot test via Termless.
 *
 * Verifies the dashboard's layout, panel titles, labels, and borders
 * match the approved mockup design. Does NOT test live data values
 * (CPU %, sparklines) — those jitter via useInterval.
 *
 * Approved mockup: vendor/silvery-internal/design/mockups/dashboard-mockup.ansi
 */

import React from "react"
import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/ag-term/src/ansi/term"
import type { TermScreen } from "../../packages/ag-term/src/ansi/types"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { Dashboard } from "../../examples/layout/dashboard"

// ============================================================================
// Setup — render once, assert many times
// ============================================================================

describe("dashboard example (termless)", { timeout: 10000 }, () => {
  let term: Term
  let handle: RunHandle
  let text: string
  let lines: string[]

  beforeAll(async () => {
    term = createTermless({ cols: 137, rows: 43 })
    handle = await run(<Dashboard />, term)
    // Capture before useInterval fires (500ms)
    await new Promise((r) => setTimeout(r, 100))
    text = term.screen!.getText()
    lines = term.screen!.getLines()
  })

  afterAll(() => {
    handle?.unmount()
  })

  // ==========================================================================
  // Header
  // ==========================================================================

  test("header: title, hostname, separator, keybindings", () => {
    expect(term.screen).toContainText("Silvery TUI")
    expect(term.screen).toContainText("system monitor showcase")
    expect(term.screen).toContainText("devbox-01")
    expect(text).toContain("┄┄┄") // decorative separator
    expect(term.screen).toContainText("[h]help")
    expect(term.screen).toContainText("[q]quit")
  })

  // ==========================================================================
  // Panel titled borders
  // ==========================================================================

  test("CPU panel: titled border with subtitle", () => {
    expect(term.screen).toContainText("CPU / Compute")
    expect(term.screen).toContainText("10 logical")
    // Title embedded in border line
    const cpuTitle = lines.find((l) => l.includes("CPU / Compute"))
    expect(cpuTitle).toBeDefined()
    expect(cpuTitle).toContain("╭")
    expect(cpuTitle).toContain("╮")
  })

  test("Memory panel: titled border with RAM total", () => {
    expect(term.screen).toContainText("Memory")
    expect(term.screen).toContainText("32 GiB")
    const memTitle = lines.find((l) => l.includes("Memory") && l.includes("╭"))
    expect(memTitle).toBeDefined()
  })

  test("Network panel: titled border with interface", () => {
    expect(term.screen).toContainText("Network")
    expect(term.screen).toContainText("en0")
    expect(term.screen).toContainText("wifi6")
  })

  test("Processes panel: titled border with sort indicator", () => {
    expect(term.screen).toContainText("Processes")
    expect(term.screen).toContainText("sorted by CPU%")
  })

  // ==========================================================================
  // CPU panel content
  // ==========================================================================

  test("CPU: summary row with total, load, temp, tasks", () => {
    expect(term.screen).toContainText("Load")
    expect(term.screen).toContainText("Temp")
    expect(term.screen).toContainText("Tasks")
  })

  test("CPU: user/sys/wait breakdown", () => {
    expect(term.screen).toContainText("User")
    expect(term.screen).toContainText("Sys")
    expect(term.screen).toContainText("Wait")
  })

  test("CPU: 10 cores rendered (cpu00 through cpu09)", () => {
    for (let i = 0; i <= 9; i++) {
      expect(term.screen).toContainText(`cpu0${i}`)
    }
  })

  test("CPU: per-core frequency and temperature", () => {
    expect(term.screen).toContainText("GHz")
    expect(term.screen).toContainText("temp")
  })

  test("CPU: package stats and history sparkline", () => {
    expect(term.screen).toContainText("Pkg")
    expect(term.screen).toContainText("Power")
    expect(term.screen).toContainText("Fan")
    expect(term.screen).toContainText("History")
  })

  // ==========================================================================
  // Memory panel content
  // ==========================================================================

  test("Memory: RAM bar with GiB format and avail", () => {
    expect(term.screen).toContainText("RAM")
    expect(term.screen).toContainText("GiB")
    expect(term.screen).toContainText("avail")
  })

  test("Memory: breakdown stats", () => {
    expect(term.screen).toContainText("Used")
    expect(term.screen).toContainText("Cache")
    expect(term.screen).toContainText("Free")
    expect(term.screen).toContainText("Slab")
  })

  test("Memory: swap with zram indicator", () => {
    expect(term.screen).toContainText("Swap")
    expect(term.screen).toContainText("zram")
  })

  test("Memory: detailed breakdown and trend", () => {
    expect(term.screen).toContainText("Apps")
    expect(term.screen).toContainText("Wired")
    expect(term.screen).toContainText("Buffers")
    expect(term.screen).toContainText("Trend")
  })

  // ==========================================================================
  // Network panel content
  // ==========================================================================

  test("Network: DL/UL with peak rates", () => {
    expect(term.screen).toContainText("DL")
    expect(term.screen).toContainText("UL")
    expect(term.screen).toContainText("Mb/s")
    expect(term.screen).toContainText("peak")
  })

  test("Network: connection stats", () => {
    expect(term.screen).toContainText("Conn")
    expect(term.screen).toContainText("Listen")
    expect(term.screen).toContainText("SYN")
    expect(term.screen).toContainText("Drops")
  })

  test("Network: packet stats and sparklines", () => {
    expect(term.screen).toContainText("Rx")
    expect(term.screen).toContainText("Tx")
    expect(term.screen).toContainText("Retrans")
    expect(term.screen).toContainText("RTT")
  })

  // ==========================================================================
  // Process table
  // ==========================================================================

  test("Process table: column headers", () => {
    expect(term.screen).toContainText("PID")
    expect(term.screen).toContainText("NAME")
    expect(term.screen).toContainText("CPU%")
    expect(term.screen).toContainText("MEM%")
    expect(term.screen).toContainText("STATUS")
    expect(term.screen).toContainText("TIME")
    expect(term.screen).toContainText("THR")
  })

  test("Process table: realistic process names", () => {
    expect(term.screen).toContainText("bun dev")
    expect(term.screen).toContainText("vite")
    expect(term.screen).toContainText("postgres")
    expect(term.screen).toContainText("docker")
    expect(term.screen).toContainText("redis")
  })

  test("Process table: footer with summary", () => {
    expect(term.screen).toContainText("processes")
    expect(term.screen).toContainText("running")
    expect(term.screen).toContainText("sleeping")
    expect(term.screen).toContainText("Threads")
  })

  // ==========================================================================
  // Border integrity
  // ==========================================================================

  test("all four panel bottom borders present", () => {
    const bottomBorders = lines.filter((l) => l.includes("╰") && l.includes("╯"))
    // CPU, Memory, Network, Processes = 4 bottom borders
    // (Network might share a row with CPU if aligned)
    expect(bottomBorders.length).toBeGreaterThanOrEqual(3)
  })

  test("separator rows present (┄ lines)", () => {
    const seps = lines.filter((l) => l.includes("┄┄┄┄┄"))
    // CPU has 2 separators, Memory has 1, Network has 1, Processes has 2 = 6
    expect(seps.length).toBeGreaterThanOrEqual(5)
  })

  test("no overlapping borders (╭ not immediately after ╭)", () => {
    let lastTopBorderRow = -10
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row]!.trimStart()
      if (line.startsWith("╭")) {
        if (row - lastTopBorderRow === 1) {
          const between = lines[row - 1]!.trimStart()
          if (!between.startsWith("╰")) {
            throw new Error(`Overlapping borders at rows ${lastTopBorderRow} and ${row}`)
          }
        }
        lastTopBorderRow = row
      }
    }
  })
})
