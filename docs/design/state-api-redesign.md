# State API Redesign — Draft

_Status: draft. Bead: km-5kh9r._

## The Problem

The current API has six entry points for state management (`createApp`, `createSlice`, `createEffects`, `createStore`, `tea()`, `run()`), each with a different shape and a different mental model. Users have to learn which ones combine, in what order, and bridge them manually. The progression from simple to complex requires learning new concepts _and_ new APIs at each step.

The specific pain points:

1. **`createApp` exposes Zustand internals.** The `() => (set, get) => ({...})` double-arrow is Zustand's StateCreator — users must learn Zustand to use Silvery.
2. **`createSlice` and `createApp` are different layers that look like alternatives.** Slice defines state+actions with signals; App wraps them in Zustand with events. The jump between them requires learning three concepts at once.
3. **"Slice" is the wrong name.** It implies "piece of a whole" (Redux/Zustand meaning), but most apps have one slice that IS the entire state.
4. **Effects are defined separately.** `createEffects()` returns builders+runners, then you wire them into `createApp` via options. Three artifacts for one concept.
5. **Two store systems.** `createApp` (Zustand-based) and `createStore` (TEA-based) solve the same problem differently. `tea()` is a middleware bridging them. Users don't know which to pick.

## Design Principles

1. **One shape.** There's one canonical way to define a domain: state + actions + effects. Call it a **model**.
2. **One sip at a time.** Each sip adds a concept, not a new API. The same `createApp` call grows with you.
3. **Zustand is an internal detail.** Users never write `(set, get) =>`. The framework bridges models to Zustand.
4. **Effects live with their model.** Runners are defined alongside actions, not wired separately.
5. **Composition scales.** One model → many models. Same `createApp`, same component access pattern.

## The Shape

### What an app IS

An app is five things:

```
Model       — state + actions + effects  (the domain, pure)
Commands    — named user intents         (maps input → actions)
Keybindings — key → command mapping      (configurable)
Plugins     — runtime capabilities       (focus, mouse dispatch, diagnostics)
Runtime     — terminal I/O + React       (the host)
```

**Model** is the pure domain. Everything else is wiring. This document is primarily about Model and how it composes into an app.

### Model

A model bundles three things: reactive state, named actions (ops-as-data), and effect runners.

```typescript
import { createModel, signal, computed } from "@silvery/tea"

const Todo = createModel({
  // State factory — returns reactive signals
  state: () => {
    const items = signal<Item[]>([])
    return {
      cursor: signal(0),
      items,
      doneCount: computed(() => items.value.filter(i => i.done).length),
    }
  },

  // Actions — named, params inferred for the Op union
  actions: {
    moveCursor(s, { delta }: { delta: number }) {
      s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
    },
    toggleDone(s, { index }: { index: number }) {
      s.items.value = s.items.value.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
      // Return effects as data
      return [
        fx.persist({ data: s.items.value }),
        fx.toast({ message: `Toggled ${s.items.value[index].text}` }),
      ]
    },
  },

  // Effect runners — execute the data returned by actions
  effects: {
    persist: async ({ data }: { data: unknown }) => {
      await fs.writeFile("data.json", JSON.stringify(data))
    },
    toast: ({ message }: { message: string }) => {
      showToast(message)
    },
  },
})

// What you get:
type TodoOp = typeof Todo.Op
// { op: "moveCursor"; delta: number } | { op: "toggleDone"; index: number }

typeof Todo.Effect
// { type: "persist"; data: unknown } | { type: "toast"; message: string }
```

**Key properties:**

- `state` is a factory returning signals. Signals are the reactivity primitive — components read `.value` and auto-subscribe. `computed()` derives from other signals.
- `actions` are pure functions: `(state, params?) → void | Effect[]`. The handler names + param types infer the `Op` union. No switch/case, no manual union.
- `effects` defines runners keyed by type. Each key also becomes a typed builder on `fx` — `fx.persist({ data })` returns `{ type: "persist", data }`. Wrong keys or params = compile error.
- The entire model is independently testable — call actions directly, assert on returned effects. No mocks.

### Model without effects

Effects are optional. A model with just state + actions is the common case for UI-only state:

```typescript
const Counter = createModel({
  state: () => ({ count: signal(0) }),
  actions: {
    increment(s) { s.count.value += 1 },
    decrement(s) { s.count.value -= 1 },
  },
})
```

This is the same API. No separate "simple" path.

## Composition

### Sip 1: `run()` — no model

Standard React. `useState` + `useInput`. No framework state management.

```tsx
function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

No model, no store, no actions. `run()` is the host — it manages terminal I/O and React rendering. This is the floor.

### Sip 2: `createApp` — one model, inline

When state needs to be shared across components, move it to `createApp`. You can inline the model definition directly:

```tsx
const app = createApp({
  state: () => ({
    cursor: signal(0),
    items: signal<Item[]>([
      { id: "1", text: "Buy milk", done: false },
      { id: "2", text: "Write docs", done: true },
    ]),
  }),

  actions: {
    moveCursor(s, { delta }: { delta: number }) {
      s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
    },
    toggleDone(s, { index }: { index: number }) {
      s.items.value = s.items.value.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
    },
  },

  events: {
    key(input, key, { apply }) {
      if (input === "j") apply({ op: "moveCursor", delta: 1 })
      if (input === "k") apply({ op: "moveCursor", delta: -1 })
      if (input === "x") apply({ op: "toggleDone", index: this.cursor.value })
      if (input === "q") return "exit"
    },
  },
})

await app.run(<TodoView />)
```

Components access state via `useApp`:

```tsx
function TodoList() {
  const cursor = useApp((s) => s.cursor.value)
  const items = useApp((s) => s.items.value)
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item.id} color={cursor === i ? "$primary" : undefined}>
          {cursor === i ? "> " : "  "}
          {item.done ? "[x] " : "[ ] "}
          {item.text}
        </Text>
      ))}
    </Box>
  )
}
```

**What changed from sip 1:** State moved from component to app. Actions are named and serializable. Events map input to actions. Components subscribe to slices of state.

**What's the same shape:** `{ state, actions }` — the model fields. `createApp` wraps an implicit model.

### Sip 3: Extract the model

When the domain gets complex or you want to test it independently, extract it:

```typescript
// todo-model.ts
export const Todo = createModel({
  state: () => ({ ... }),
  actions: { ... },
  effects: { ... },
})

// app.ts
const app = createApp({
  model: Todo,
  events: { key(...) { ... } },
})
```

**What changed:** `{ state, actions, effects }` moved from inline to `createModel()`. The app definition shrinks to model + events.

**What you gain:** The model is testable in isolation. Effects are bundled with the domain. The `Op` and `Effect` unions are exported types.

### Sip 4: Commands + keybindings

When you want customizable keybindings, a command palette, or AI automation — turn events into named commands:

```typescript
const app = createApp({
  model: Todo,

  commands: {
    cursor_down: {
      name: "Move Down",
      action: (ctx) => ({ op: "moveCursor", delta: 1 }),
    },
    cursor_up: {
      name: "Move Up",
      action: (ctx) => ({ op: "moveCursor", delta: -1 }),
    },
    toggle_done: {
      name: "Toggle Done",
      action: (ctx) => ({ op: "toggleDone", index: ctx.state.cursor.value }),
    },
  },

  keybindings: {
    j: "cursor_down",
    k: "cursor_up",
    x: "toggle_done",
  },
})

// Now available:
app.cmd.cursor_down()        // invoke by name
app.cmd.all()                // list for command palette
// AI agent drives the app by command name, not key simulation
```

**What changed:** `events.key` replaced by `commands` + `keybindings`. Input is now data — remappable, discoverable, automatable.

### Sip 5: Multiple models

When one model gets too big, split into independent state machines:

```typescript
const Board = createModel({ state: () => ({ ... }), actions: { ... }, effects: { ... } })
const Dialog = createModel({ state: () => ({ ... }), actions: { ... }, effects: { ... } })
const Search = createModel({ state: () => ({ ... }), actions: { ... }, effects: { ... } })

const app = createApp({
  models: {
    board: Board,
    dialog: Dialog,
    search: Search,
  },
  commands: { ... },
  keybindings: { ... },
})
```

Components access namespaced state:

```tsx
function BoardView() {
  const cursor = useApp((s) => s.board.cursor.value)
  const items = useApp((s) => s.board.items.value)
  // ...
}
```

Commands target specific models:

```typescript
commands: {
  cursor_down: {
    name: "Move Down",
    action: (ctx) => ctx.board.apply({ op: "moveCursor", delta: 1 }),
  },
  open_search: {
    name: "Search",
    action: (ctx) => ctx.search.apply({ op: "open" }),
  },
}
```

### Cross-model communication

Models never import each other. They communicate through dispatch effects:

```typescript
const Dialog = createModel({
  state: () => ({ open: signal(false), value: signal("") }),
  actions: {
    confirm(s) {
      s.open.value = false
      return [fx.dispatch("board", { op: "addItem", text: s.value.value })]
    },
  },
  effects: {
    dispatch: ({ target, ...op }, { models }) => {
      models[target].apply(op)
    },
  },
})
```

The `dispatch` effect is data — it describes intent ("tell board to add an item") without importing Board. The runner resolves it at runtime.

## Plugins

Plugins add runtime capabilities that aren't part of the domain. They compose via `pipe()`:

```typescript
const app = pipe(
  createApp({ model: Todo, commands, keybindings }),
  withFocus(),          // Tab/Shift-Tab navigation, focus scopes
  withDomEvents(),      // onClick, onMouseDown on components
  withDiagnostics(),    // Render validation, instrumentation
)
```

Plugins are `(app) => enhancedApp` — the same SlateJS pattern. They override methods on the app (press, click) to intercept and process events before they reach commands.

**Key rule:** Plugins are infrastructure, not domain. They don't define state or actions — they add capabilities to the runtime (focus tracking, mouse hit-testing, debug checks).

The full composition:

```
using app = pipe(
  createApp({ models, commands, keybindings })
  ├─ withFocus()            focus tree, Tab/Escape
  ├─ withDomEvents()        onClick, onMouseDown → components
  ├─ withDiagnostics()      render invariant checks
)

await app.run(<View />)
```

## Architecture

```
                    ┌─────────────────────┐
                    │     createApp()      │
                    │                      │
  ┌────────┐       │  ┌──────┐ ┌──────┐  │
  │  run() │       │  │Model │ │Model │  │
  │        │       │  │state │ │state │  │
  │useState│       │  │action│ │action│  │
  │useInput│       │  │effect│ │effect│  │
  │        │       │  └──────┘ └──────┘  │
  │  (no   │       │                      │
  │ model) │       │  commands             │
  └────────┘       │  keybindings          │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Zustand bridge │  │  ← internal detail
                    │  └────────────────┘  │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │  pipe() + plugins    │
                    │  withFocus()         │
                    │  withDomEvents()     │
                    │  withDiagnostics()   │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │     app.run()        │
                    │  React + Terminal    │
                    └──────────────────────┘
```

The pipeline at runtime:

```
keypress / click / timer
         │
    ┌────▼─────┐
    │ Plugins  │  focus routing, DOM event dispatch
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Commands │  key → command name → action
    └────┬─────┘
         │
    ┌────▼─────┐
    │  apply() │  model.actions[op.op](state, params)
    └────┬─────┘
         │
    ┌────▼─────┐
    │  State   │  signal updates → Zustand → selective re-render
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Effects  │  data → runners (persist, toast, dispatch, ...)
    └──────────┘
```

## What Changes

| Current | New | Why |
|---------|-----|-----|
| `createSlice(init, handlers)` | `createModel({ state, actions, effects? })` | Better name, bundles effects |
| `createEffects({ ... })` | `effects` field in `createModel` | One definition, not two |
| `createApp(() => (set, get) => {...}, handlers)` | `createApp({ model, events/commands })` | No Zustand exposure |
| `tea(state, reducer, { runners })` | Removed — absorbed by `createApp` internals | Users don't need the bridge |
| `createStore(config)` | Stays — escape hatch for framework-free TEA | Niche but real use case |
| `run(element)` | Stays — sip 1, no model | The floor |
| `pipe()` + plugins | Stays — unchanged | Already clean |

## Open Questions

1. **Auto-signaling.** Should `state: () => ({ count: 0 })` auto-wrap plain values in signals? Reduces ceremony but hides the reactivity mechanism. Proposal: support both — plain object = auto-signaled, factory with explicit `signal()` = manual control.

2. **Naming: "model" vs alternatives.** "Model" is Elm's term (good precedent) but overloaded elsewhere (MVC, ML). Alternatives: `machine` (emphasizes state machine), `domain` (too abstract), `module` (too generic). Leaning: **model**.

3. **`useApp` with multiple models.** Should it be `useApp(s => s.board.cursor.value)` (namespaced) or `useBoard(s => s.cursor.value)` (generated hooks)? Namespaced is simpler; generated hooks are more ergonomic but add magic.

4. **Event handler shape.** The `events.key(input, key, ctx)` handler in sip 2 — should it match the current `EventHandler` signature or simplify? Currently receives `(data, ctx)` with `ctx` having `set`/`get`/`focusManager`. With models, `ctx` should have `apply` and `state` instead.

5. **Effect builder access.** In the current design, actions reference `fx.persist(...)` which comes from `createEffects`. With effects defined in the model, how do actions reference the builders? Options: (a) `this.fx.persist(...)`, (b) builders auto-available as a third argument, (c) `return [{ type: "persist", data }]` — plain objects, no builders. Leaning: **(c)** plain objects — the model definition already declares the types, so the builders are just convenience. TypeScript can validate the union.

6. **Backward compatibility.** `createSlice` and `createApp` have users (km, examples, tests). Migration path: keep old APIs as thin wrappers over `createModel` + new `createApp`, deprecate over one release cycle.
