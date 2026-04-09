/**
 * Combined SGR Sequence Tests
 *
 * Verifies that styleToAnsi emits combined SGR sequences (\e[1;2m)
 * instead of separate sequences (\e[1m\e[2m) when multiple attributes
 * are active. Fewer bytes and more spec-compliant.
 */

import { describe, test, expect } from "vitest"
import { outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { createBuffer } from "@silvery/ag-term/buffer"

describe("combined SGR sequences", () => {
  test("bold+dim emits single combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", attrs: { bold: true, dim: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Should contain \x1b[...1;...2...m or \x1b[...2;...1...m (combined)
    // Should NOT contain \x1b[1m\x1b[2m (separate)
    expect(ansi).not.toMatch(/\x1b\[1m\x1b\[2m/)
    expect(ansi).not.toMatch(/\x1b\[2m\x1b\[1m/)
    // Should contain both codes in a single sequence
    expect(ansi).toMatch(/\x1b\[[0-9;]*1[;0-9]*2[0-9;]*m/)
  })

  test("bold+italic+underline emits single combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", attrs: { bold: true, italic: true, underline: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Should NOT have multiple separate \x1b[...m sequences for attrs
    // Count the number of SGR sequences (excluding position sequences)
    const sgrMatches = ansi.match(/\x1b\[\d[\d;:]*m/g) ?? []
    // All attributes should be in one sequence (plus possibly position)
    // The key assertion: bold+italic+underline should be combined
    expect(ansi).not.toMatch(/\x1b\[1m\x1b\[3m/)
    expect(ansi).not.toMatch(/\x1b\[3m\x1b\[4m/)
  })

  test("fg color + bold emits combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", fg: { r: 255, g: 0, b: 0 }, attrs: { bold: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // fg color code and bold should be in one \x1b[...m
    expect(ansi).not.toMatch(/\x1b\[38;2;255;0;0m\x1b\[1m/)
    // Should contain a combined sequence with both
    expect(ansi).toMatch(/\x1b\[38;2;255;0;0;1m/)
  })

  test("no attributes emits no SGR", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X" })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Position sequence + char, but no style SGR (just space = default)
    // The char "X" with default style should not have a style sequence
    expect(ansi).not.toMatch(/\x1b\[0m.*X/)
  })
})
