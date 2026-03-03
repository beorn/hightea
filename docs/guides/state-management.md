# State Management

> inkx composes [Zustand](https://github.com/pmndrs/zustand) (store + React hooks) with optional [Preact Signals](https://github.com/preactjs/signals) (fine-grained reactivity). Pick the right tool for each problem.

| Level | inkx API | What you get |
|-------|----------|-------------|
| **1 — Component** | `run()` + `useState` | Local state, no abstractions |
| **2 — Shared** | `createApp()` + `useApp()` | Shared store, centralized keys, optional signals |
| **3 — Ops as Data** | + domain objects with `.apply()` | Undo/redo, replay, AI automation |
| **4 — Effects as Data** | + `effects` option in `createApp()` | Testable I/O, swappable runners |

Most apps only need Level 2. For the "as data" architecture behind Levels 3-4, see [Operations and Effects as Data](as-data-patterns.md).

## Level 1: Component State

State lives in individual components — just React.

```tsx
import { run, useInput } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

Good for single-component apps, prototypes, and simple tools.

## Level 2: Shared State

`createApp()` gives you a Zustand store shared across all components, centralized key handling, terminal I/O, and exit handling — all bundled into `app.run(<Component />)`.

```tsx
import { createApp, useApp } from "inkx/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: ["first", "second", "third"],
    moveCursor(delta: number) {
      set(s => ({ cursor: clamp(s.cursor + delta, 0, s.items.length - 1) }))
    },
  }),
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)

function ItemList() {
  const cursor = useApp(s => s.cursor)
  const items = useApp(s => s.items)
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item} color={cursor === i ? "cyan" : undefined}>
          {cursor === i ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}

await app.run(<ItemList />)
```

Components access the store via `useApp(selector)`. The selector tells Zustand which slice to watch — `useApp(s => s.cursor)` re-renders only when cursor changes.

### Reactivity: Selectors vs Signals

Consider a table with 10,000 rows. Each `<Row>` component needs the row data and whether it's selected. With plain Zustand:

```tsx
function Row({ id }: { id: string }) {
  const data = useApp(s => s.rows.get(id))
  const selected = useApp(s => s.cursor === id)
  return <Text inverse={selected}>{data.text}</Text>
}
```

This works correctly — each Row re-renders only when its selectors return different values. But Zustand runs *every* selector on *every* store update. Move the cursor once → 10,000 selector calls, two return different values, two rows re-render. The diffing is cheap per call, but scales linearly with mounted components.

**Signals** flip this. Instead of "tell me what you read" (selectors), components just read `.value` and automatically subscribe to exactly what they touched:

```tsx
import { signal, computed } from "@preact/signals-core"

const app = createApp(
  () => {
    const cursor = signal<string>("row-0")
    const rows = signal(new Map<string, RowData>())

    return {
      cursor,
      rows,
      currentRow: computed(() => rows.value.get(cursor.value)),
      moveCursor(id: string) { cursor.value = id },
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(nextId)
      if (input === "q") return "exit"
    },
  },
)
```

`signal()` creates reactive state. `computed()` derives from other signals — `currentRow` recomputes only when `cursor` or `rows` change. Move the cursor → only components reading `cursor` re-render. No selector diffing, no linear scan.

inkx bridges signals and Zustand with a middleware — when any signal's `.value` changes, Zustand subscribers are also notified. Both subscription models work side by side.

When updating multiple signals at once, wrap in `batch()` so the bridge fires once:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = "row-0"
  rows.value = newRows
  filter.value = ""
})
// → single Zustand notification, single re-render
```

**At scale (10,000+ items)**, combine per-entity signals with `VirtualList` — only ~50 visible rows are mounted, and each row's signal is independent:

```tsx
const app = createApp(
  () => {
    const cursor = signal<string>("row-0")
    const rows = new Map<string, Signal<RowData>>()  // per-entity signals

    return {
      cursor,
      rows,
      currentRow: computed(() => rows.get(cursor.value)?.value),
      updateRow(id: string, data: RowData) {
        const s = rows.get(id)
        if (s) s.value = data  // only this row's subscribers re-render
      },
      removeRow(id: string) {
        rows.delete(id)  // clean up — stale signals keep being watched
      },
    }
  },
)
```

Edit one row → 1 re-render. Move cursor → 2 re-renders (old + new). O(visible), not O(total).

**You don't need this for most apps.** A few top-level signals in the store handles dozens of components fine. Reach for `Map<string, Signal<T>>` when you have per-entity state with many concurrent subscribers — typically virtualized lists, tree views, or document editors.

### Extracting domain functions

As your store grows, pull transition logic into a domain object for testability:

```tsx
const TodoList = {
  moveCursor(s: State, delta: number) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
  toggleDone(s: State, index: number) {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  },
}

// Test without React, store, or mocks:
test("moveCursor clamps at bottom", () => {
  const s = { cursor: signal(2), items: signal(["a", "b", "c"]) }
  TodoList.moveCursor(s, 1)
  expect(s.cursor.value).toBe(2) // clamped
})
```

Domain functions mutate signals but perform no I/O — deterministic, no external side effects, fully testable. Think Immer reducers: pure from the outside, internally mutative. This is intentional — signals are designed as long-lived mutable containers.

## Levels 3-4: Ops and Effects as Data

inkx's `createApp()` supports two additional patterns from the [ops and effects architecture](as-data-patterns.md):

**Level 3 — Operations as data**: Domain functions take params objects instead of positional args (`delta` becomes `{ delta }`), making operations serializable. An `.apply(state, op)` method dispatches op objects to named functions. This enables undo/redo, replay, logging, and AI automation.

**Level 4 — Effects as data**: Domain functions return `Effect[]` — plain objects describing side effects. inkx's effects middleware intercepts these returns and routes them to declared runners:

```tsx
const app = createApp(
  () => {
    const state = { cursor: signal(0), items: signal<Item[]>([]) }
    return {
      ...state,
      apply: (op: TodoOp) => TodoList.apply(state, op),
    }
  },
  {
    effects: {
      persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
      toast: ({ message }) => { showToast(message) },
    },
    key(input, key, { store }) {
      if (input === "j") store.apply({ op: "moveCursor", delta: 1 })
      if (input === "x") store.apply({ op: "toggleDone", index: store.cursor.value })
      if (input === "q") return "exit"
    },
  },
)
```

See [Operations and Effects as Data](as-data-patterns.md) for the full pattern, examples, and prior art.

## Composing Machines in a Store

Multiple domain objects share a single `createApp()` store. Each owns its slice of signal state:

```tsx
const app = createApp(
  () => {
    const boardState = { cursor: signal(0), items: signal<Item[]>([]) }
    const dialogState = { open: signal(false), value: signal("") }
    const searchState = { query: signal(""), results: signal<string[]>([]) }

    return {
      ...boardState,
      dialog: dialogState,
      search: searchState,
      applyBoard: (op: BoardOp) => Board.apply(boardState, op),
      applyDialog: (op: DialogOp) => Dialog.apply(dialogState, op),
      applySearch: (op: SearchOp) => Search.apply(searchState, op),
    }
  },
  {
    effects: {
      dispatch: ({ op, ...params }) => { /* route to the right machine */ },
      persist: async ({ data }) => { /* save to disk */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.applyDialog({ op: "open", kind: "search" })
      if (input === "j") store.applyBoard({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Components pick what they need — they only re-render when the signals they read change:

```tsx
function SearchBar() {
  const { search } = useApp()
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

One store, multiple machines, fine-grained subscriptions.

## See Also

- [Operations and Effects as Data](as-data-patterns.md) — the architecture pattern behind Levels 3-4
- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
