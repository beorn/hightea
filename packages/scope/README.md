# @silvery/scope

Structured concurrency scopes for silvery apps.

A scope unifies cancellation (`AbortSignal`), cleanup (`defer`), hierarchy (`child`), and timed operations (`sleep`, `timeout`) into one composable primitive. Works with TC39 `using` for automatic disposal.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/scope
```

## Quick Start

```ts
import { createScope } from "@silvery/scope"

using scope = createScope("app")
const child = scope.child("fetch")
child.defer(() => console.log("cleaned up"))
await child.sleep(100)
// child is auto-disposed when scope is disposed
```

## API

### Factory

- **`createScope(name?, parent?)`** -- Create a new scope (optionally linked to a parent)

### Scope Interface

- **`scope.signal`** -- `AbortSignal` cancelled when scope is disposed
- **`scope.cancelled`** -- Whether the scope has been disposed
- **`scope.defer(fn)`** -- Register cleanup (called in reverse order on dispose)
- **`scope.child(name?)`** -- Create a child scope (auto-disposed with parent)
- **`scope.sleep(ms)`** -- Cancellation-aware sleep
- **`scope.timeout(ms, fn)`** -- Cancellation-aware timeout, returns cancel function

### Plugin

- **`withScope(name?)`** -- App plugin that adds a root scope, disposed with the app

## License

MIT
