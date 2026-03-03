# State Management Guide

> Start simple. Add structure when complexity demands it. Each level makes one more thing visible to the system.

inkx supports four levels of state management. Each level builds on the previous — the concepts carry forward, and you can mix levels within a single app. Under the hood, inkx composes [Zustand](https://github.com/pmndrs/zustand) (store + React integration) with optional [Preact Signals](https://github.com/preactjs/signals) (fine-grained reactivity) — see the [Appendix](#what-inkx-composes) for details.

| Level | What becomes visible | What you can now do |
|-------|---------------------|---------------------|
| **1 — Component** | — | Local state, no abstractions |
| **2 — Shared** | State | Share across components, observe, derive, centralized keys |
| **3 — Ops as Data** | Operations | Undo/redo, replay, AI automation, collaboration, logging |
| **4 — Effects as Data** | Side effects | Testable I/O, swappable runners, serializable effects |

Most apps never need to go beyond Level 2.

### Level 1: Component State

State lives in individual components. No coordination overhead — just React.

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

### Level 2: Shared State

`createApp()` gives you a [Zustand](https://github.com/pmndrs/zustand) store shared across all components, with centralized key handling and effect dispatch. Components access the store via `useApp()`. It also bundles terminal I/O, exit handling, and key routing into a single `app.run(<Component />)` call.

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

#### Signals for fine-grained reactivity

Zustand re-renders a component when its selector returns a different value — `useApp(s => s.cursor)` re-renders on every cursor change, but not on item changes. This works well, but every component must specify exactly which state it reads, and Zustand diffs the selector result on every store update.

Signals flip this: components that read a signal's `.value` automatically subscribe to just that signal — no selectors needed, no diffing. For apps with many components or frequent updates, this is more efficient. Signals use [`@preact/signals-core`](https://github.com/preactjs/signals) — the same model as SolidJS, Vue 3, and the [TC39 Signals proposal](https://github.com/tc39/proposal-signals).

```tsx
import { createApp, useApp } from "inkx/runtime"
import { signal, computed } from "@preact/signals-core"

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal(["first", "second", "third"])
    const currentItem = computed(() => items.value[cursor.value])

    return {
      cursor,
      items,
      currentItem,
      moveCursor(delta: number) {
        cursor.value = clamp(cursor.value + delta, 0, items.value.length - 1)
      },
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)
```

`signal()` creates reactive state. `computed()` derives from other signals — `currentItem` recomputes only when `cursor` or `items` change.

inkx bridges signals and Zustand with a middleware — when any signal's `.value` changes, Zustand subscribers are notified. Both subscription models work: signal `.value` reads (automatic) and `useApp(s => s.cursor.value)` selectors (familiar). When updating multiple signals at once, wrap them in `batch()` so the bridge fires once:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → single Zustand notification, single re-render
```

#### Extracting domain functions

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
  const s = { cursor: signal(2), items: signal([{ text: "a" }, { text: "b" }, { text: "c" }]) }
  TodoList.moveCursor(s, 1)
  expect(s.cursor.value).toBe(2) // clamped
})
```

The domain functions mutate signals but perform no I/O — they're "pure" in the sense that matters: deterministic, no external side effects, fully testable. Think of them like Immer reducers — pure from the outside, internally mutative. This is intentional: signals are designed as long-lived mutable containers.

Good for most interactive TUI apps — dashboards, file browsers, list views, dialogs.

### Level 3: Operations as Data

Operations become plain objects — just JSON. A discriminator field (`op`) identifies what to do; the remaining fields are the parameters. No classes, no closures. Same shape as Redux actions, Elm messages, and event sourcing events. We call them **ops**.

Domain functions take a params object instead of positional args. This single change — `delta` becomes `{ delta }` — makes operations serializable:

```tsx
import { signal, computed, type Signal } from "@preact/signals-core"

interface State {
  cursor: Signal<number>
  items: Signal<{ text: string; done: boolean }[]>
}

type TodoOp =
  | { op: "moveCursor"; delta: number }
  | { op: "toggleDone"; index: number }
  | { op: "addItem"; text: string }

const TodoList = {
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
  toggleDone(s: State, { index }: { index: number }) {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  },
  addItem(s: State, { text }: { text: string }) {
    s.items.value = [...s.items.value, { text, done: false }]
  },

  // Dispatch: op object → named function
  apply(s: State, op: TodoOp) {
    const { op: name, ...params } = op
    return (TodoList as any)[name](s, params)
  },
}
```

Both calling styles work — direct calls for simplicity, `.apply()` for serialization:

```tsx
// Direct call (simple, type-safe)
TodoList.moveCursor(state, { delta: 1 })

// Serializable op (undo, replay, AI, collaboration)
TodoList.apply(state, { op: "moveCursor", delta: 1 })
// → JSON.stringify({ op: "moveCursor", delta: 1 })
```

The store wires ops to the domain object:

```tsx
const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal<{ text: string; done: boolean }[]>([])
    const state = { cursor, items }

    return {
      cursor,
      items,
      currentItem: computed(() => items.value[cursor.value]),
      doneCount: computed(() => items.value.filter(i => i.done).length),
      apply: (op: TodoOp) => TodoList.apply(state, op),
      moveCursor: (d: number) => TodoList.moveCursor(state, { delta: d }),
      toggleDone: (i: number) => TodoList.toggleDone(state, { index: i }),
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.apply({ op: "moveCursor", delta: 1 })
      if (input === "k") store.apply({ op: "moveCursor", delta: -1 })
      if (input === "x") store.apply({ op: "toggleDone", index: store.cursor.value })
      if (input === "q") return "exit"
    },
  },
)
```

Testing is the same as Level 2 — but now you can also test with serialized ops:

```tsx
test("apply dispatches to named functions", () => {
  const s = { cursor: signal(0), items: signal([{ text: "a", done: false }]) }
  TodoList.apply(s, { op: "toggleDone", index: 0 })
  expect(s.items.value[0].done).toBe(true)
})
```

### Level 4: Effects as Data

Domain functions return effects as plain objects — the same shape as ops. A discriminator field (`effect`) identifies what should happen; the remaining fields are the parameters. The runtime dispatches them to declared effect runners. The domain function never touches I/O.

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const TodoList = {
  // No effects — same as Level 3
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },

  // Returns effects as data
  toggleDone(s: State, { index }: { index: number }): Effect[] {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
    return [
      { effect: "persist", data: s.items.value },
      { effect: "toast", message: `Marked ${s.items.value[index].text} as done` },
    ]
  },

  addItem(s: State, { text }: { text: string }): Effect[] {
    s.items.value = [...s.items.value, { text, done: false }]
    return [{ effect: "persist", data: s.items.value }]
  },

  apply(s: State, op: TodoOp) {
    const { op: name, ...params } = op
    return (TodoList as any)[name](s, params)
  },
}
```

Effects use the same shape as ops — plain objects with a discriminator and named params. The runtime dispatches them to effect runners, just like `.apply()` dispatches ops to domain functions:

```tsx
const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal<Item[]>([])
    const state = { cursor, items }

    return {
      cursor,
      items,
      currentItem: computed(() => items.value[cursor.value]),
      doneCount: computed(() => items.value.filter(i => i.done).length),
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

Assert on what the domain function *says should happen*, not on whether it happened:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })

  expect(s.items.value[0].done).toBe(true)
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Marked Buy milk as done" })
})
```

No mocks. No I/O. No async.

**The upgrade is per-function, not per-app.** Within a single domain object, some functions return nothing (Level 3) and others return `Effect[]` (Level 4). You upgrade individual functions as they need effects.

### Scaling with Signals

At small scale, a few signals in a store is all you need. At large scale (1000+ items, tree views, document editors), you want per-entity signals so that editing one node doesn't re-render others.

The pattern: `Map<string, Signal<T>>` for per-entity reactive state, `computed()` for derived views:

```tsx
import { signal, computed, type Signal } from "@preact/signals-core"

// Per-entity signals — editing one node doesn't touch others
const nodes = new Map<string, Signal<NodeData>>()
const cursor = signal<string>("node-1")
const folds = new Map<string, Signal<boolean>>()

// Derived — recomputes only when its specific dependencies change
const currentNode = computed(() => nodes.get(cursor.value)?.value)
const visibleCount = computed(() => {
  let count = 0
  for (const [id, folded] of folds) if (!folded.value) count++
  return count
})
```

Inside a store, the same pattern:

```tsx
const app = createApp(
  () => {
    const cursor = signal<string>("root")
    const nodes = new Map<string, Signal<NodeData>>()
    const folds = new Map<string, Signal<boolean>>()

    return {
      cursor,
      nodes,
      folds,
      currentNode: computed(() => nodes.get(cursor.value)?.value),
      visibleCount: computed(() => [...folds.values()].filter(f => !f.value).length),
      moveTo(nodeId: string) { cursor.value = nodeId },
      toggleFold(nodeId: string) {
        const f = folds.get(nodeId)
        if (f) f.value = !f.value
      },
    }
  },
)
```

Cursor move: `cursor` signal notifies, `currentNode` recomputes, components reading `currentNode` re-render. Components reading other nodes — unaffected. With `VirtualList` limiting mounted components to ~30-50 visible items, this is O(visible) not O(total).

**Cleanup**: When items are removed, delete their signals from the Map. The bridge middleware tracks signals it discovers in the store — stale signals left in a Map will continue to be watched:

```tsx
removeNode(nodeId: string) {
  nodes.delete(nodeId)
  folds.delete(nodeId)
}
```

**You don't need per-entity signals for most apps.** A few top-level signals in the store handles dozens of components fine. Reach for `Map<string, Signal<T>>` when you have per-entity state with many concurrent subscribers — typically virtualized lists, tree views, or document editors.

## Composing Machines

Level 3-4 domain objects are just functions — you can structure them however you like. For complex apps, a useful pattern is decomposing into independent state machines that communicate through effects:

```tsx
const Board = {
  moveCursor(s: BoardState, { delta }: { delta: number }) { ... },
  fold(s: BoardState, { nodeId }: { nodeId: string }): Effect[] { ... },
  apply(s: BoardState, op: BoardOp) { ... },
}

const Dialog = {
  open(s: DialogState, { kind }: { kind: string }) { ... },
  confirm(s: DialogState): Effect[] {
    s.open.value = false
    return [{ effect: "dispatch", op: "addItem", text: s.value.value }]
  },
  apply(s: DialogState, op: DialogOp) { ... },
}

const Search = {
  setQuery(s: SearchState, { query }: { query: string }) { ... },
  submit(s: SearchState): Effect[] { ... },
  apply(s: SearchState, op: SearchOp) { ... },
}
```

Machines compose via dispatch effects — no machine imports another. `Dialog.confirm()` says "dispatch addItem" as a data object; the effect runner routes it to the right domain function.

Each machine is independently testable. Communication is through serializable effect objects. A full-scale application might have 5-10 machines covering board navigation, text editing, dialogs, search, and undo/redo — all pure functions operating on signals, composing through effects.

### Combining state within a store

All machines share a single `createApp()` store. Each machine owns its slice of signal state — the store factory wires them together:

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
  // Only re-renders when query or results change — cursor moves don't affect it
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

One store, multiple machines, fine-grained subscriptions. No prop drilling, no selector boilerplate, no unnecessary re-renders.

## Appendix

### What inkx composes

inkx's state management is a thin integration layer, not a from-scratch framework:

| Concern | Library | Role |
|---------|---------|------|
| Reactive primitives | [`@preact/signals-core`](https://github.com/preactjs/signals) | `signal()`, `computed()`, `.value` — fine-grained reactivity (optional) |
| Store container | [Zustand](https://github.com/pmndrs/zustand) | Store identity, middleware, `useApp(selector)` React integration |
| App lifecycle | inkx `createApp()` | Terminal I/O, key routing, effect dispatch, exit handling |

`createApp()` creates a Zustand store and adds two middlewares: one that bridges signals to Zustand subscribers (so both subscription models work), and one that intercepts `Effect[]` returns and routes them to declared effect runners. Everything else — signal reactivity, store subscriptions, React hooks — comes from the underlying libraries.

### Alternatives by level

| Level | Alternatives |
|-------|-------------|
| 2 — Shared | React Context + `useReducer`, prop drilling, Redux |
| 3 — Ops as Data | Redux actions + switch/case reducers, Elm messages, event sourcing events, Command pattern |
| 4 — Effects as Data | Promises/thunks (opaque), dependency injection (wiring), mocking (fragile), Elm `Cmd`, redux-loop |

### Prior art

| System | Level | Approach |
|--------|-------|----------|
| React useState | 1 | Component-local state |
| Zustand | 2 | Shared store with selectors |
| SolidJS / Vue 3 | 2+ | Fine-grained signals reactivity |
| Redux | 3 | `dispatch(action)` + reducer |
| Event sourcing | 3 | Events as plain objects — store, replay, project |
| Elm | 3-4 | `update : Msg -> Model -> (Model, Cmd Msg)` |
| redux-loop / Hyperapp v2 | 4 | Reducer returns `[state, effects]` |
| inkx `createStore` | 4 | Non-React TEA container (see [Runtime Layers](runtime-layers.md)) |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
