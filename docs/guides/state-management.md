# State Management Guide

> Start simple. Add structure when complexity demands it. Each level changes exactly one thing.

inkx supports a progression of state management approaches. Most apps never need to go beyond Level 2. Each level builds on the previous — the concepts carry forward, and you can mix levels within a single app.

## The Levels

```
Level 1: Component State     useState/useReducer              — local, per-component
Level 2: Shared State        createApp + set/get              — shared, centralized
Level 3: Pure Transitions    createApp + domain functions     — structured, testable
Level 4: Effects as Data     createApp + [state, effects]     — pure, serializable, replayable
```

### Level 1: Component State

The simplest model. State lives in individual components. No coordination overhead, no abstractions — just React.

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

Good for single-component apps, prototypes, and simple tools where state is local and self-contained.

### Level 2: Shared State

**The problem**: Multiple components need the same state. You're passing props through layers that don't use them. Key handling is scattered across components instead of centralized.

**The solution**: `createApp()` provides shared state across all components. Components subscribe to individual slices via `useApp(selector)` — only the ones that read a changed field re-render. Key handling moves to one place.

This is equivalent to Zustand's `create()` + `useStore(selector)` pattern, or Redux's `useSelector()` — but `createApp` integrates the store with the app lifecycle (input, exit, effects) so you don't wire them separately.

```tsx
import { createApp, useApp } from "inkx/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: ["first", "second", "third"],
    moveCursor: (d: number) =>
      set((s) => ({ cursor: Math.max(0, Math.min(s.cursor + d, s.items.length - 1)) })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j") get().moveCursor(1)
      if (input === "k") get().moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)

function ItemList() {
  const items = useApp((s) => s.items)
  const cursor = useApp((s) => s.cursor)
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item} color={i === cursor ? "cyan" : undefined}>
          {i === cursor ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}

await app.run(<ItemList />)
```

Good for most interactive TUI apps — dashboards, file browsers, list views, dialogs. State is shared but the transitions are simple enough to express as `set()` calls.

### Level 3: Pure Transitions

**The problem**: State transitions get complex — multiple fields updated together, conditional logic in `set()` callbacks, no clear record of *what happened*. You can't test state logic without mounting React components.

**The solution**: Extract transitions into pure domain functions. The store shape stays the same — methods still call `set()` — but now they delegate to pure functions you can test by calling directly. No React, no mocks, no async.

```tsx
import { createApp, useApp } from "inkx/runtime"

interface State {
  cursor: number
  items: { text: string; done: boolean }[]
}

// Pure domain logic — testable without the store
const TodoList = {
  moveCursor: (s: State, delta: number): State =>
    ({ ...s, cursor: clamp(s.cursor + delta, 0, s.items.length - 1) }),

  toggleDone: (s: State, index: number): State =>
    ({ ...s, items: s.items.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    ) }),

  addItem: (s: State, text: string): State =>
    ({ ...s, items: [...s.items, { text, done: false }] }),
}

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: [] as { text: string; done: boolean }[],
    moveCursor: (d: number) => set(s => TodoList.moveCursor(s, d)),
    toggleDone: (i: number) => set(s => TodoList.toggleDone(s, i)),
    addItem: (t: string) => set(s => TodoList.addItem(s, t)),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j") get().moveCursor(1)
      if (input === "k") get().moveCursor(-1)
      if (input === "x") get().toggleDone(get().cursor)
      if (input === "q") return "exit"
    },
  },
)
```

Testing is trivial — call the pure function, check the result:

```tsx
test("moveCursor clamps at bottom", () => {
  const state = { cursor: 2, items: [{ text: "a" }, { text: "b" }, { text: "c" }] }
  expect(TodoList.moveCursor(state, 1).cursor).toBe(2) // clamped
})
```

No React, no mocks, no async. The store methods are thin wrappers — all logic lives in the domain functions.

This is the same idea as Redux reducers (`(state, action) → state`) but without the `switch`/`case` boilerplate, action type constants, or dispatch ceremony. The domain functions are just functions — call them with state in, get state out.

Good for apps with structured state transitions. This is the sweet spot for most complex TUI apps.

### Level 4: Effects as Data

**The problem**: Side effects (file I/O, HTTP, timers, toasts) are tangled into your store methods. You can test that state changed, but not that a save was triggered or a notification was sent — not without mocking the world. Undo/redo requires snapshotting because transitions aren't invertible. Collaborative editing requires serializable operations, but your effects are function calls.

**The solution**: Domain functions return `[state, effects]` instead of just `state`. Effects are data objects describing what should happen — the runtime executes them. The domain function never touches I/O, making it a true pure function. Effect runners are swappable: production runners do real I/O, test runners collect and assert, replay runners skip I/O. This unlocks undo/redo, AI automation, and platform portability (same domain functions in terminal and browser).

This is the Elm Architecture: `update : Msg -> Model -> (Model, Cmd Msg)`. Also implemented by redux-loop and Hyperapp v2. inkx detects the tuple via `Array.isArray` — return plain state when there are no effects, return `[state, effects]` when there are. No wrapper types, no special constructors.

```tsx
type Effect =
  | { type: "persist"; data: unknown }
  | { type: "toast"; message: string }

const TodoList = {
  // No effects needed — return state directly (Level 3 style)
  moveCursor: (s: State, delta: number): State =>
    ({ ...s, cursor: clamp(s.cursor + delta, 0, s.items.length - 1) }),

  // Effects needed — return [state, effects] tuple
  toggleDone: (s: State, index: number): [State, Effect[]] => {
    const items = s.items.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
    return [
      { ...s, items },
      [
        { type: "persist", data: items },
        { type: "toast", message: `Marked ${items[index].text} as done` },
      ],
    ]
  },

  addItem: (s: State, text: string): [State, Effect[]] => [
    { ...s, items: [...s.items, { text, done: false }] },
    [{ type: "persist", data: [...s.items, { text, done: false }] }],
  ],
}

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: [] as Item[],
    moveCursor: (d: number) => set(s => TodoList.moveCursor(s, d)),
    toggleDone: (i: number) => set(s => TodoList.toggleDone(s, i)),
    addItem: (t: string) => set(s => TodoList.addItem(s, t)),
  }),
  {
    effects: {
      persist: async (effect) => { await fs.writeFile("data.json", JSON.stringify(effect.data)) },
      toast: (effect) => { showToast(effect.message) },
    },
    key: (input, key, { get }) => {
      if (input === "j") get().moveCursor(1)
      if (input === "x") get().toggleDone(get().cursor)
      if (input === "q") return "exit"
    },
  },
)
```

The store methods look identical to Level 3 — `set(s => TodoList.toggleDone(s, i))`. The `set()` middleware detects the `[state, effects]` tuple automatically and routes effects to the declared runners.

Assert on what the domain function *says should happen*, not on whether it happened:

```tsx
test("toggleDone persists and toasts", () => {
  const state = { cursor: 0, items: [{ text: "Buy milk", done: false }] }
  const [next, effects] = TodoList.toggleDone(state, 0)

  expect(next.items[0].done).toBe(true)
  expect(effects).toContainEqual({ type: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ type: "toast", message: "Marked Buy milk as done" })
})
```

No mocks. No I/O. No async. No `collect()` helper needed — the domain function already returns the tuple.

**The upgrade is per-function, not per-app.** Within a single domain object, some functions return plain state (Level 3) and others return `[state, effects]` (Level 4). You don't rewrite everything — you upgrade individual functions as they need effects.

### Reactive Subscriptions

At Levels 2-3, `useApp(selector)` re-evaluates every selector on every state change — components bail out if their slice didn't change, but the check is O(selectors). This is fine for dozens of subscribers but breaks down at scale (1000+ list items each subscribing to cursor position).

For large state trees, Level 4 pairs with `Reactive<T>` — a signal primitive that notifies only when a specific value changes:

```tsx
import { Reactive, useReactive } from "inkx"

// State fields that need granular subscriptions are Reactive<T>
interface State {
  cursor: Reactive<number>
  items: Reactive<Item[]>
  folds: Map<string, Reactive<boolean>>
}

// Domain functions write directly to reactive fields
const Board = {
  moveCursor: (s: State, delta: number) => {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
}

// Components subscribe to individual signals — O(1) per change
function ListItem({ index }: { index: number }) {
  const cursor = useReactive(state.cursor)
  const items = useReactive(state.items)
  const isCurrent = cursor === index

  return (
    <Text color={isCurrent ? "cyan" : undefined}>
      {isCurrent ? "> " : "  "}{items[index].text}
    </Text>
  )
}
```

Cursor move: 1 signal notifies, all mounted `ListItem` components re-evaluate `cursor === index`, only the 2 that changed (old and new) re-render. With `VirtualList` limiting mounted items to ~30-50 visible, this is O(visible) not O(total).

#### Derived Reactive State

Reactive values can depend on other reactive values. A `Derived<T>` recomputes when any of its dependencies change — like a spreadsheet cell formula:

```tsx
import { Reactive, Derived, useReactive } from "inkx"

const cursor = Reactive(0)
const items = Reactive([{ text: "Buy milk", done: false }, { text: "Write docs", done: true }])

// Derived values — recompute only when dependencies change
const currentItem = Derived(() => items.value[cursor.value])
const doneCount = Derived(() => items.value.filter(i => i.done).length)
const progress = Derived(() => `${doneCount.value}/${items.value.length}`)

function StatusBar() {
  const text = useReactive(progress)      // re-renders when progress string changes
  return <Text>Progress: {text}</Text>
}

function CurrentItemView() {
  const item = useReactive(currentItem)    // re-renders when cursor moves OR current item changes
  return <Text bold>{item.text}</Text>
}
```

`Derived` tracks which reactive values were read during computation. When `cursor.value` changes, `currentItem` recomputes (it reads `cursor`), but `doneCount` doesn't (it only reads `items`). When `items.value` changes, both recompute. This is the same model as SolidJS `createMemo` or Vue `computed`.

`Reactive<T>` replaces the need for Jotai atoms, Zustand selectors, or Redux's `useSelector` at this scale. It's equivalent to SolidJS signals or Vue refs, but integrated with React via `useSyncExternalStore`.

**You don't need Reactive<T> for most apps.** `useApp(selector)` is simpler and works well up to hundreds of subscribers. Reach for `Reactive<T>` when you have per-entity state with 1000+ potential subscribers — typically virtualized lists, tree views, or document editors.

## When to Use Each Level

| Signal | Level |
|--------|-------|
| One component, simple state | 1 — Component |
| Multiple components share state | 2 — Shared |
| Complex transitions, want testable state logic | 3 — Pure Transitions |
| Side effects in transitions, want pure/testable/replayable | 4 — Effects as Data |
| Undo/redo, collaborative editing, action replay | 4 — Effects as Data |
| AI automation (operations as tool calls) | 4 — Effects as Data |

## Composing Machines

Level 4 domain objects are just functions — you can structure them however you like. For complex apps, a useful pattern is decomposing into independent state machines that communicate through effects:

```tsx
// Each domain is a pure object with the same pattern
const Board = {
  moveCursor: (s: BoardState, delta: number): BoardState => ...,
  fold: (s: BoardState, nodeId: string): [BoardState, Effect[]] => ...,
}

const Dialog = {
  open: (s: DialogState, kind: string): DialogState => ...,
  confirm: (s: DialogState): [DialogState, Effect[]] =>
    [{ ...s, open: false }, [{ type: "dispatch", op: "addItem", text: s.value }]],
}

const Search = {
  setQuery: (s: SearchState, query: string): SearchState => ...,
  submit: (s: SearchState): [SearchState, Effect[]] => ...,
}
```

Machines compose via dispatch effects — no machine imports another. `Dialog.confirm()` says "dispatch addItem" as a data object; the effect runner routes it to the right domain function.

Each machine is independently testable. Communication is through serializable effect objects.

## km: A Complete Level 4 Application

[km](https://github.com/beorn/km) is a full-featured TUI workspace built on inkx. It demonstrates the complete Level 4 architecture at scale — every subsystem is a pure `(state, op) → [state, effects]` function (km calls these "noun-singletons" with an `.apply()` convention, following the SlateJS pattern):

- **Board navigation**: `Board.apply(state, op) → [state, effects]` — cursor movement, folding, zoom, multi-select
- **Text editing**: `PlainText.apply(state, op) → [state, effects]` — readline-style character editing, kill ring via effects
- **Dialogs**: `Dialog.apply(state, op) → [state, effects]` — search, create item, filter — all dispatch results to board
- **Undo/redo**: `withHistory` plugin wraps `.apply()` — records invertible operations, replays them for undo
- **Command system**: Maps keys → semantic operations → dispatches to the right machine
- **Platform portable**: Same `.apply()` functions work in terminal (inkx) and browser (React DOM)

The top-level store delegates to domain machines:

```tsx
const app = createApp(
  () => (set, get) => ({
    board: Board.init(),
    text: PlainText.init(),
    insertText: (char: string) => set(s => PlainText.apply(s.text, { type: "insert", char })),
    cursorDown: () => set(s => Board.apply(s.board, { type: "cursor_down" })),
  }),
  { effects: { persist: ..., toast: ... } },
)
```

Each `.apply()` returns `State | [State, Effect[]]` — the `set()` middleware handles both shapes. The progression was gradual — km started at Level 2, moved transition logic to Level 3, then migrated effects to data (Level 4) one function at a time.

## Prior Art

| System | Level | Approach |
|--------|-------|----------|
| React useState | 1 | Component-local state |
| Zustand | 2-3 | Shared store with selectors, `set/get`, pure functions |
| Redux | 3 | `(state, action) → state` — same concept, more ceremony |
| Elm | 4 | `update : Msg -> Model -> (Model, Cmd Msg)` — the original |
| redux-loop | 4 | Reducer returns [state, effects] — Elm Architecture for Redux |
| Hyperapp v2 | 4 | Optional tuple return (same Array.isArray detection) |
| SolidJS signals | — | Fine-grained reactivity (equivalent to `Reactive<T>`) |
| Vue refs | — | Fine-grained reactivity (equivalent to `Reactive<T>`) |
| inkx createStore | 4 | Non-React TEA container: `(msg, model) → [model, effects]` (see [Runtime Layers](runtime-layers.md)) |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
- [km TEA State Machines](../../../docs/design/tea-state-machines.md) — full architecture for a Level 4 app
