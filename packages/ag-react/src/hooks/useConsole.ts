import type { Console, ConsoleEntry } from "@silvery/ag-term/ansi"
import { effect } from "@silvery/signals"
import { useEffect, useState } from "react"

/**
 * Hook to subscribe to console entries from a Term's Console owner.
 * Re-renders at most every {@link debounceMs} ms to prevent infinite
 * render loops when pipeline debug logging is active (e.g. `-vv`).
 *
 * Internally watches `console.count` (cheap per-log notification signal)
 * and calls `console.entriesSnapshot()` at debounce-flush time, so a burst
 * of entries costs a single snapshot copy rather than one per log.
 */
export function useConsole(console: Console, debounceMs = 200): readonly ConsoleEntry[] {
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>(() => console.entriesSnapshot())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      // Re-snapshot AT flush time so a burst of entries arriving during the
      // debounce window still lands in state. Copy cost is paid once per
      // flush, not once per log (was O(n²) before — Pro review P1-9).
      setEntries(console.entriesSnapshot())
    }
    const stop = effect(() => {
      // Subscribe via count — cheap. Value is ignored; the flush re-snapshots.
      console.count()
      if (timer !== null) return
      timer = setTimeout(flush, debounceMs)
    })
    // Pick up entries captured before the effect's seed read landed.
    setEntries(console.entriesSnapshot())
    return () => {
      stop()
      if (timer !== null) clearTimeout(timer)
    }
  }, [console, debounceMs])

  return entries
}
