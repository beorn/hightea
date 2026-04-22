/**
 * Tests for the Output owner — intercepts process.stdout/stderr writes in alt screen mode.
 *
 * Run: bun vitest run tests/features/output.test.ts
 */
import { describe, expect, test, afterEach } from "vitest"
import { createOutput, type Output } from "@silvery/ag-term/runtime/devices/output"
import { createTerm } from "@silvery/ag-term"
import { readFileSync, unlinkSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("createOutput", () => {
  let guard: Output | null = null

  afterEach(() => {
    // Always dispose to restore process streams
    if (guard) {
      guard.dispose()
      guard = null
    }
  })

  test("suppresses non-silvery stdout writes when active", () => {
    // Save what the test setup installed as stdout.write
    const setupWrite = process.stdout.write

    guard = createOutput()
    guard.activate()

    // The owner replaces stdout.write — non-silvery writes should be suppressed
    // (return true but not call the original)
    const result = process.stdout.write("rogue output")
    expect(result).toBe(true)

    // After dispose, the original (setup) write should be restored
    guard.dispose()
    expect(process.stdout.write).toBe(setupWrite)
    guard = null
  })

  test("allows silvery render output through write()", () => {
    // Track what gets written through the original (pre-activate) stdout.write
    const written: string[] = []
    const setupWrite = process.stdout.write
    // Replace with a spy before activating
    process.stdout.write = ((chunk: any) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutput()
    guard.activate()

    // write() should allow output through to the saved original
    guard.write("\x1b[2J") // Pure ANSI control sequence (won't trigger test setup error)

    // The output went through our spy
    expect(written).toEqual(["\x1b[2J"])

    // Regular write should be suppressed
    process.stdout.write("rogue")
    expect(written).toEqual(["\x1b[2J"]) // No new entry

    guard.dispose()
    guard = null
    // Restore the setup write
    process.stdout.write = setupWrite
  })

  test("redirects stderr to log file", () => {
    const logPath = join(tmpdir(), `output-test-${Date.now()}.log`)

    guard = createOutput({ stderrLog: logPath })
    guard.activate()

    // Write to stderr — should go to file, not terminal
    process.stderr.write("debug message 1\n")
    process.stderr.write("debug message 2\n")

    // Read the log file
    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain("debug message 1")
    expect(content).toContain("debug message 2")

    guard.dispose()
    guard = null

    // Cleanup temp file
    if (existsSync(logPath)) unlinkSync(logPath)
  })

  test("suppresses stderr when no file and no buffer", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    guard = createOutput()
    guard.activate()

    // This should be suppressed (no file, no buffer option)
    const result = process.stderr.write("suppressed stderr\n")
    expect(result).toBe(true) // Returns true (pretends success)

    guard.dispose()
    guard = null

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })

  test("buffers stderr and flushes on deactivate", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    // Track what the original stderr write receives
    const flushed: string[] = []
    const setupStderr = process.stderr.write
    process.stderr.write = ((chunk: any) => {
      flushed.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutput({ bufferStderr: true })
    guard.activate()

    // Write some stderr while active
    process.stderr.write("buffered line 1\n")
    process.stderr.write("buffered line 2\n")

    // Nothing flushed yet (it's buffered)
    expect(flushed).toEqual([])

    // Dispose flushes the buffer through the original stderr
    guard.dispose()
    guard = null

    expect(flushed).toContain("buffered line 1\n")
    expect(flushed).toContain("buffered line 2\n")

    // Restore setup stderr
    process.stderr.write = setupStderr

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })

  test("deactivate restores original write methods", () => {
    const origStdout = process.stdout.write
    const origStderr = process.stderr.write

    guard = createOutput()
    guard.activate()

    // Methods should be intercepted (different from originals)
    expect(process.stdout.write).not.toBe(origStdout)
    expect(process.stderr.write).not.toBe(origStderr)

    guard.deactivate()

    // Methods should be restored (still alive — not disposed)
    expect(process.stdout.write).toBe(origStdout)
    expect(process.stderr.write).toBe(origStderr)

    // Can re-activate
    guard.activate()
    expect(process.stdout.write).not.toBe(origStdout)

    guard.dispose()
    guard = null

    // Methods should be restored again
    expect(process.stdout.write).toBe(origStdout)
    expect(process.stderr.write).toBe(origStderr)
  })

  test("dispose and deactivate are idempotent", () => {
    guard = createOutput()
    guard.activate()
    guard.dispose()
    guard.dispose() // Should not throw
    guard.deactivate() // Should not throw (already disposed)
    guard.activate() // No-op after dispose
    guard = null
  })

  test("active property reflects owner state", () => {
    guard = createOutput()
    expect(guard.active).toBe(false)

    guard.activate()
    expect(guard.active).toBe(true)

    guard.deactivate()
    expect(guard.active).toBe(false)

    guard.activate()
    expect(guard.active).toBe(true)

    guard.dispose()
    expect(guard.active).toBe(false)
    guard = null
  })

  test("Symbol.dispose works for using pattern", () => {
    const origStdout = process.stdout.write

    {
      using g = createOutput()
      g.activate()
      expect(process.stdout.write).not.toBe(origStdout)
    }

    // After scope exit, should be restored
    expect(process.stdout.write).toBe(origStdout)
  })

  test("write returns boolean", () => {
    // Use a spy that doesn't actually write to terminal
    const setupWrite = process.stdout.write
    process.stdout.write = (() => true) as any

    guard = createOutput()
    guard.activate()
    const result = guard.write("\x1b[H") // Pure ANSI — won't trigger test setup error

    expect(typeof result).toBe("boolean")

    guard.dispose()
    guard = null
    process.stdout.write = setupWrite
  })

  test("stderr from DEBUG_LOG env var", () => {
    const logPath = join(tmpdir(), `output-env-test-${Date.now()}.log`)
    const origDebugLog = process.env.DEBUG_LOG
    process.env.DEBUG_LOG = logPath

    guard = createOutput() // Should pick up DEBUG_LOG from env
    guard.activate()

    process.stderr.write("env-directed log\n")

    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain("env-directed log")

    guard.dispose()
    guard = null

    // Restore env and cleanup
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    } else {
      delete process.env.DEBUG_LOG
    }
    if (existsSync(logPath)) unlinkSync(logPath)
  })

  test("concurrent write calls work correctly", () => {
    const written: string[] = []
    const setupWrite = process.stdout.write
    process.stdout.write = ((chunk: any) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutput()
    guard.activate()

    // Multiple silvery writes in sequence
    guard.write("\x1b[H")
    guard.write("\x1b[2J")
    guard.write("\x1b[0m")

    expect(written).toHaveLength(3)

    // Interleaved non-silvery writes are suppressed
    process.stdout.write("rogue 1")
    guard.write("\x1b[K")
    process.stdout.write("rogue 2")

    expect(written).toHaveLength(4) // Only the silvery write added

    guard.dispose()
    guard = null
    process.stdout.write = setupWrite
  })

  test("suppressedCount tracks suppressed stdout writes", () => {
    guard = createOutput()
    guard.activate()

    expect(guard.suppressedCount).toBe(0)

    process.stdout.write("rogue 1")
    expect(guard.suppressedCount).toBe(1)

    process.stdout.write("rogue 2")
    process.stdout.write("rogue 3")
    expect(guard.suppressedCount).toBe(3)

    // write does not increment suppressed count
    guard.write("\x1b[H")
    expect(guard.suppressedCount).toBe(3)
  })

  test("redirectedCount tracks redirected stderr writes", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    guard = createOutput()
    guard.activate()

    expect(guard.redirectedCount).toBe(0)

    process.stderr.write("stderr 1\n")
    expect(guard.redirectedCount).toBe(1)

    process.stderr.write("stderr 2\n")
    process.stderr.write("stderr 3\n")
    expect(guard.redirectedCount).toBe(3)

    guard.dispose()
    guard = null

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })
})

describe("term.output", () => {
  test("headless Term has undefined output", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.output).toBeUndefined()
  })

  test("Node-backed Term with mock stdout has undefined output", () => {
    // Non-real stdout → no output owner (mock streams don't benefit from the guard)
    const mockStdout = {
      write: () => true,
      isTTY: false,
      columns: 80,
      rows: 24,
      on: () => mockStdout,
      off: () => mockStdout,
    } as unknown as NodeJS.WriteStream
    const term = createTerm({ stdout: mockStdout })
    expect(term.output).toBeUndefined()
  })

  test("term.output.write() bypasses the intercept when inactive", () => {
    // Construct an owner directly and exercise the term.output-compatible API.
    // This confirms the Output surface contract used by term.output consumers.
    const written: string[] = []
    const setupWrite = process.stdout.write
    process.stdout.write = ((chunk: any) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    const output = createOutput()
    // Not activated — write() should forward to the current (spy) stdout.write
    output.write("\x1b[H")
    expect(written).toEqual(["\x1b[H"])

    output.dispose()
    process.stdout.write = setupWrite
  })
})
