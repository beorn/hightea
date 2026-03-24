# @silvery/test

Testing utilities for silvery — virtual renderer, locators, and assertions.

```console
$ npm install @silvery/test
```

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)

expect(term.screen).toContainText("Hello")
await handle.press("j")
```
