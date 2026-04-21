/**
 * Term provider resize coalescing — burst SIGWINCH events collapse to one.
 *
 * When a terminal multiplexer (cmux / tmux / Ghostty tabs) fires multiple
 * SIGWINCH events in rapid succession as the PTY re-syncs (e.g. on tab
 * switch-back), the term provider MUST emit ONE `resize` event carrying
 * the final dimensions — not one event per SIGWINCH. Otherwise the app
 * re-lays out 2-3 times in quick succession, producing visible layout
 * shift.
 *
 * Bead: km-tui.tab-switch-layout-shift
 *
 * This tests the term-provider directly — the level where coalescing
 * must live to catch bursts before they ever enter the event loop.
 */

import EventEmitter from "node:events"
import { describe, test, expect } from "vitest"
import { createTermProvider } from "../../packages/ag-term/src/runtime/term-provider"

// ============================================================================
// Helpers
// ============================================================================

// Mock stdin — a TTY-shaped EventEmitter that never emits data.
function createMockStdin(): NodeJS.ReadStream {
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream
  ;(stdin as unknown as { isTTY: boolean }).isTTY = false
  ;(stdin as unknown as { setRawMode: (v: boolean) => void }).setRawMode = () => {}
  ;(stdin as unknown as { resume: () => void }).resume = () => {}
  ;(stdin as unknown as { pause: () => void }).pause = () => {}
  ;(stdin as unknown as { setEncoding: (e: string) => void }).setEncoding = () => {}
  return stdin
}

// Mock stdout — a TTY-shaped EventEmitter with mutable columns/rows that
// emits `resize` events synchronously (matches Node's real behavior).
function createMockStdout(cols = 80, rows = 24): NodeJS.WriteStream {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  ;(stdout as unknown as { isTTY: boolean }).isTTY = false
  ;(stdout as unknown as { write: (s: string) => boolean }).write = () => true
  return stdout
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Drive the events() generator — collect events for `runMs` milliseconds,
// then cancel. Returns the collected resize events (cols/rows pairs).
async function collectResizeEvents(
  provider: ReturnType<typeof createTermProvider>,
  runMs: number,
  driver: () => Promise<void>,
): Promise<Array<{ cols: number; rows: number }>> {
  const received: Array<{ cols: number; rows: number }> = []

  const iter = provider.events()
  const consume = (async () => {
    for await (const event of iter) {
      if (event.type === "resize") {
        received.push(event.data as { cols: number; rows: number })
      }
    }
  })()

  // Give the generator a microtask to set up its stdin/stdout listeners.
  await sleep(0)

  await driver()
  await sleep(runMs)

  // Stop the generator
  provider[Symbol.dispose]()
  await consume.catch(() => {})
  return received
}

// ============================================================================
// Tests
// ============================================================================

describe("term-provider: resize coalescing", () => {
  test("burst of 3 SIGWINCH within 16ms emits ONE resize event with final dims", async () => {
    const stdin = createMockStdin()
    const stdout = createMockStdout(80, 24)
    const provider = createTermProvider(stdin, stdout)

    const events = await collectResizeEvents(provider, 100, async () => {
      // Simulate cmux tab-switch-back: 3 rapid SIGWINCH events as PTY re-syncs.
      ;(stdout as unknown as { columns: number }).columns = 100
      ;(stdout as unknown as { rows: number }).rows = 30
      stdout.emit("resize")

      await sleep(2)

      ;(stdout as unknown as { columns: number }).columns = 110
      ;(stdout as unknown as { rows: number }).rows = 32
      stdout.emit("resize")

      await sleep(2)

      // Final dims — what the settled terminal geometry is.
      ;(stdout as unknown as { columns: number }).columns = 120
      ;(stdout as unknown as { rows: number }).rows = 35
      stdout.emit("resize")
    })

    // The key assertion: the burst collapsed to ONE resize event.
    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ cols: 120, rows: 35 })
  })

  test("two resizes separated by > coalesce window emit two events", async () => {
    const stdin = createMockStdin()
    const stdout = createMockStdout(80, 24)
    const provider = createTermProvider(stdin, stdout)

    const events = await collectResizeEvents(provider, 150, async () => {
      ;(stdout as unknown as { columns: number }).columns = 100
      ;(stdout as unknown as { rows: number }).rows = 30
      stdout.emit("resize")

      // Wait well past the 16ms coalesce window so the first event flushes.
      await sleep(50)

      ;(stdout as unknown as { columns: number }).columns = 120
      ;(stdout as unknown as { rows: number }).rows = 35
      stdout.emit("resize")
    })

    expect(events.length).toBe(2)
    expect(events[0]).toEqual({ cols: 100, rows: 30 })
    expect(events[1]).toEqual({ cols: 120, rows: 35 })
  })

  test("single SIGWINCH still emits one resize event", async () => {
    const stdin = createMockStdin()
    const stdout = createMockStdout(80, 24)
    const provider = createTermProvider(stdin, stdout)

    const events = await collectResizeEvents(provider, 50, async () => {
      ;(stdout as unknown as { columns: number }).columns = 100
      ;(stdout as unknown as { rows: number }).rows = 30
      stdout.emit("resize")
    })

    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ cols: 100, rows: 30 })
  })

  test("rapid 5-event burst still coalesces to one with final dims", async () => {
    const stdin = createMockStdin()
    const stdout = createMockStdout(80, 24)
    const provider = createTermProvider(stdin, stdout)

    const events = await collectResizeEvents(provider, 100, async () => {
      for (const [cols, rows] of [
        [90, 26],
        [95, 27],
        [100, 28],
        [110, 30],
        [120, 35],
      ] as const) {
        ;(stdout as unknown as { columns: number }).columns = cols
        ;(stdout as unknown as { rows: number }).rows = rows
        stdout.emit("resize")
        // No sleep — all emit synchronously within a microtask tick.
      }
    })

    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ cols: 120, rows: 35 })
  })
})
