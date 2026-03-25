# @silvery/headless

Pure state machines for UI components -- no React, no rendering, no side effects.

Each machine is a pure `(state, action) -> state` function that you can use anywhere: terminal, browser, tests, or server.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/headless
```

## Quick Start

```ts
import { createSelectListState, selectListUpdate } from "@silvery/headless"

let state = createSelectListState({ count: 10 })
state = selectListUpdate(state, { type: "move_down" })
console.log(state.index) // 1
```

## API

### State Machines

- **`createMachine(update, initialState)`** -- Observable state container wrapping any update function
- **`selectListUpdate(state, action)`** -- Cursor navigation over a list (move up/down, jump to start/end)
- **`createSelectListState(opts)`** -- Initial state for a select list
- **`readlineUpdate(state, action)`** -- Text editing with cursor, kill ring, and history
- **`createReadlineState(opts)`** -- Initial state for a readline editor

### React Hooks

- **`useSelectList(opts)`** -- React hook wrapping `selectListUpdate` as component state
- **`useReadline(opts)`** -- React hook wrapping `readlineUpdate` as component state

### Types

`Machine`, `UpdateFn`, `SelectListState`, `SelectListAction`, `ReadlineState`, `ReadlineAction`

## License

MIT
