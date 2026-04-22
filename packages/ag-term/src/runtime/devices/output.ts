/**
 * Output — single-owner stdout/stderr/console mediator for a silvery session.
 *
 * Mirrors `InputOwner` (`../input-owner.ts`) for the write side: one owner per
 * Term, stable across the session. When active, intercepts process.stdout,
 * process.stderr, and console.* so only the render pipeline (via `output.write`)
 * reaches the terminal. Non-silvery writes are suppressed (stdout) or redirected
 * to `options.stderrLog`/`process.env.DEBUG_LOG` (stderr/console).
 *
 * ## Lifecycle
 *
 * Constructed once per Term, initially deactivated. `activate()` installs the
 * intercepts; `deactivate()` restores originals; `dispose()` does final cleanup
 * (closes stderr fd, flushes buffered stderr). The activate/deactivate cycle is
 * used by the runtime to temporarily pass writes through during pause/resume
 * (console mode, log dump).
 *
 * ## Relation to InputOwner
 *
 * InputOwner is constructed once at term creation, activated immediately (it
 * needs raw mode + stdin data listener to mediate probes). Output is
 * constructed deactivated because installing intercepts before protocol setup
 * (alt screen, kitty keyboard) would suppress the setup sequences themselves.
 * The runtime calls `activate()` after protocol setup completes.
 */

import { openSync, writeSync, closeSync } from "node:fs"
import { createLogger } from "loggily"

const log = createLogger("silvery:guard")

export interface Output extends Disposable {
  /** Write data to stdout. When active, bypasses the intercept (silvery's render
   * pipeline writes go through here). When inactive, forwards to the raw
   * stdout.write. */
  write(data: string | Uint8Array): boolean
  /** Whether intercepts are currently installed. */
  readonly active: boolean
  /** Activate intercepts: installs stdout/stderr/console patches. Idempotent —
   * no-op if already active. Options override those passed at construction. */
  activate(options?: OutputOptions): void
  /** Deactivate intercepts: restores original stdout/stderr/console methods.
   * Idempotent. Closes stderr log fd if open. */
  deactivate(): void
  /** Number of stdout writes suppressed since construction (cumulative across
   * activate/deactivate cycles). */
  readonly suppressedCount: number
  /** Number of stderr writes redirected since construction (cumulative across
   * activate/deactivate cycles). */
  readonly redirectedCount: number
  /** Final cleanup: deactivates + any teardown. Idempotent. */
  dispose(): void
  [Symbol.dispose](): void
}

export interface OutputOptions {
  /** File path to redirect stderr to (default: process.env.DEBUG_LOG) */
  stderrLog?: string
  /** If true, buffer stderr and flush on deactivate instead of redirecting to file */
  bufferStderr?: boolean
}

/**
 * Create an Output owner. Starts deactivated — call `activate()` to install
 * intercepts. Call `dispose()` for final cleanup.
 */
export function createOutput(defaultOptions?: OutputOptions): Output {
  let disposed = false
  let active = false

  // Cumulative stats across activate/deactivate cycles
  let suppressedCount = 0
  let redirectedCount = 0

  // Saved originals — captured at activation time, restored at deactivation
  let savedStdoutWrite: typeof process.stdout.write | null = null
  let savedStderrWrite: typeof process.stderr.write | null = null
  let origStdoutWrite: ((chunk: unknown, ...args: unknown[]) => boolean) | null = null
  let origStderrWrite: ((chunk: unknown, ...args: unknown[]) => boolean) | null = null
  let savedConsoleLog: typeof console.log | null = null
  let savedConsoleInfo: typeof console.info | null = null
  let savedConsoleWarn: typeof console.warn | null = null
  let savedConsoleError: typeof console.error | null = null
  let savedConsoleDebug: typeof console.debug | null = null

  // Stderr redirection state (re-created on activate, torn down on deactivate)
  let stderrFd: number | null = null
  let stderrBuffer: string[] = []
  let bufferStderr = false

  // Route flag — when true, stdout.write(…) inside the intercept forwards to the
  // original (silvery's own write() path toggles this briefly).
  let silveryWriting = false

  function activate(options?: OutputOptions): void {
    if (disposed) return
    if (active) return
    active = true

    const opts = { ...defaultOptions, ...options }
    bufferStderr = !!opts.bufferStderr

    savedStdoutWrite = process.stdout.write
    savedStderrWrite = process.stderr.write
    origStdoutWrite = savedStdoutWrite.bind(process.stdout) as typeof origStdoutWrite
    origStderrWrite = savedStderrWrite.bind(process.stderr) as typeof origStderrWrite

    const stderrLog = opts.stderrLog ?? process.env.DEBUG_LOG
    if (stderrLog) {
      try {
        stderrFd = openSync(stderrLog, "a")
      } catch {
        // If we can't open the log file, fall back to suppression
      }
    }

    process.stdout.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (silveryWriting) {
        return origStdoutWrite!(chunk, ...args)
      }
      // Non-silvery stdout write -- suppress in alt screen
      suppressedCount++
      const preview = typeof chunk === "string" ? chunk.slice(0, 60) : "<binary>"
      log?.debug?.(`suppressed stdout write (${suppressedCount}): ${JSON.stringify(preview)}`)
      return true
    } as typeof process.stdout.write

    process.stderr.write = function (chunk: unknown, ..._args: unknown[]): boolean {
      const str = typeof chunk === "string" ? chunk : String(chunk)
      redirectedCount++
      if (stderrFd !== null) {
        try {
          writeSync(stderrFd, str)
        } catch {
          // File may have been closed externally
        }
        return true
      }
      if (bufferStderr) {
        stderrBuffer.push(str)
        return true
      }
      return true
    } as typeof process.stderr.write

    // Intercept console methods — they write to stderr in Bun/Node and bypass
    // the process.stderr.write patch (they use internal C++ bindings).
    savedConsoleLog = console.log
    savedConsoleInfo = console.info
    savedConsoleWarn = console.warn
    savedConsoleError = console.error
    savedConsoleDebug = console.debug

    function redirectConsole(...args: unknown[]): void {
      const str = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ") + "\n"
      redirectedCount++
      if (stderrFd !== null) {
        try {
          writeSync(stderrFd, str)
        } catch {
          // File may have been closed
        }
        return
      }
      if (bufferStderr) {
        stderrBuffer.push(str)
        return
      }
    }

    console.log = redirectConsole as typeof console.log
    console.info = redirectConsole as typeof console.info
    console.warn = redirectConsole as typeof console.warn
    console.error = redirectConsole as typeof console.error
    console.debug = redirectConsole as typeof console.debug

    log?.info?.("activated" + (stderrLog ? ` (stderr -> ${stderrLog})` : " (stderr suppressed)"))
  }

  function deactivate(): void {
    if (!active) return
    active = false

    if (savedStdoutWrite) process.stdout.write = savedStdoutWrite
    if (savedStderrWrite) process.stderr.write = savedStderrWrite
    if (savedConsoleLog) console.log = savedConsoleLog
    if (savedConsoleInfo) console.info = savedConsoleInfo
    if (savedConsoleWarn) console.warn = savedConsoleWarn
    if (savedConsoleError) console.error = savedConsoleError
    if (savedConsoleDebug) console.debug = savedConsoleDebug

    log?.info?.(
      `deactivated (suppressed ${suppressedCount} stdout, redirected ${redirectedCount} stderr)`,
    )

    // Flush buffered stderr through the original
    if (origStderrWrite && stderrBuffer.length > 0) {
      for (const line of stderrBuffer) {
        origStderrWrite(line)
      }
    }
    stderrBuffer = []

    if (stderrFd !== null) {
      try {
        closeSync(stderrFd)
      } catch {
        // Already closed
      }
      stderrFd = null
    }

    savedStdoutWrite = null
    savedStderrWrite = null
    origStdoutWrite = null
    origStderrWrite = null
    savedConsoleLog = null
    savedConsoleInfo = null
    savedConsoleWarn = null
    savedConsoleError = null
    savedConsoleDebug = null
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    deactivate()
  }

  return {
    write(data) {
      if (active && origStdoutWrite) {
        silveryWriting = true
        try {
          return origStdoutWrite(data)
        } finally {
          silveryWriting = false
        }
      }
      // Not active — forward straight to the current stdout.write (whatever it
      // is now). Caller is responsible for any additional routing.
      return process.stdout.write(data as string | Uint8Array)
    },
    get active() {
      return active
    },
    activate,
    deactivate,
    get suppressedCount() {
      return suppressedCount
    },
    get redirectedCount() {
      return redirectedCount
    },
    dispose,
    [Symbol.dispose]: dispose,
  }
}
