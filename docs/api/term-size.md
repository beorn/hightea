# term.size

Single source of truth for terminal dimensions. Backed by [alien-signals](https://github.com/stackblitz/alien-signals) so every reader sees the same value and resize events coalesce into one notification per frame.

`term.size` replaces direct `process.stdout.columns` / `stdout.rows` reads and ad-hoc `stdout.on("resize", …)` subscriptions. Scattered resize handling meant each consumer implemented its own coalescing (or didn't) — the owner centralizes both.

## Shape

```ts
interface SizeSnapshot {
  readonly cols: number
  readonly rows: number
}

interface Size extends Disposable {
  readonly cols: number
  readonly rows: number
  readonly snapshot: SizeSnapshot
  subscribe(handler: (s: SizeSnapshot) => void): () => void
}
```

## Access

```ts
using term = createTerm()

console.log(`starting size: ${term.size.cols}×${term.size.rows}`)

const unsubscribe = term.size.subscribe((s) => {
  console.log(`resized to ${s.cols}×${s.rows}`)
})
```

`term.size` is always present. For headless and emulator-backed Terms the owner is a fixed-dimensions variant (`createFixedSize`) with an `update(cols, rows)` method that the emulator calls explicitly on resize.

## Live reads

`term.size.cols` and `term.size.rows` read the current value of the underlying alien-signal. Every read reflects the latest resize that has cleared the coalescing window.

`term.size.snapshot` returns a plain `SizeSnapshot` — useful when you want to pin values for a render pass:

```ts
const { cols, rows } = term.size.snapshot
const layout = computeLayout({ cols, rows })
```

Because the underlying storage is a signal, reads inside a `computed(…)` or `effect(…)` register a dependency automatically:

```ts
import { computed } from "@silvery/signals"

const columns = computed(() => Math.floor(term.size.cols / 20))
// `columns` auto-recomputes on every resize
```

## Resize coalescing

Multiplexers (tmux, cmux, Ghostty tabs) can emit multiple `SIGWINCH` bursts as the PTY re-syncs. Without coalescing, each burst triggers a layout pass at an intermediate size and the user sees visible multi-phase layout shift.

The owner coalesces bursts within a single 60 Hz frame (16 ms). Within that window, only the **final** geometry is delivered to subscribers:

```
t=0   stdout.columns=100  stdout.emit("resize")
t=2   stdout.columns=110  stdout.emit("resize")
t=5   stdout.columns=120  stdout.emit("resize")
t=16  flush → subscribers receive { cols: 120, rows: … } ONCE
```

Discrete resizes spaced further apart than 16 ms pass through normally.

```ts
const events: SizeSnapshot[] = []
term.size.subscribe((s) => events.push(s))

// PTY burst — three rapid resizes
// → events.length === 1, events[0] === final geometry
```

The coalescing window can be overridden via `createSize(stdout, { coalesceMs })`. `coalesceMs: 0` disables coalescing for tests.

## `subscribe(handler)`

Registers a subscriber that fires on every coalesced change. Returns an unsubscribe function. Multiple subscribers can coexist; each receives the same `SizeSnapshot` reference.

```ts
using term = createTerm()
const stop = term.size.subscribe((s) => {
  console.log(`size is now ${s.cols}×${s.rows}`)
})

// later…
stop()
```

Inside React, `useBoxRect` and the runtime context already read through `term.size`. Components get dimension updates without subscribing directly.

## Fallbacks

At construction, the owner reads `stdout.columns` / `stdout.rows`. If either is missing or zero (non-TTY stdout), the owner falls back to `80 × 24` — callers can override with `createSize(stdout, { cols, rows })`.

## Dispose

Removes the `resize` listener, clears any pending coalesce timer, drops subscribers. Idempotent. The last known cols/rows remain readable after dispose — useful for post-exit summaries.

## See also

- [alien-signals](https://github.com/stackblitz/alien-signals) — the reactive primitive
- [`@silvery/signals`](/reference/signals) — Silvery's thin wrapper (signal, computed, effect)
- [Term — the I/O umbrella](/guide/term)
