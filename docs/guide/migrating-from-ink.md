# Migrating from Ink

Four steps from Ink to Silvery. Each step is independently shippable — you don't have to do them all at once.

## Step 1: Drop-in replacement

Change one import. Zero code changes. Everything works.

```diff
- import { Box, Text, render, useInput, useApp } from 'ink'
+ import { Box, Text, render, useInput, useApp } from 'silvery/ink'
```

What you get immediately:
- 100x+ faster incremental rendering
- Responsive flexbox layouts (flexily engine)
- 38 built-in color palettes with semantic tokens
- Virtual DOM with layout feedback (`useContentRect`)

All Ink hooks work: `useInput`, `useApp`, `useFocus`, `useFocusManager`, `useStdin`, `useStdout`, `useStderr`.

All Ink components work: `Box`, `Text`, `Static`, `Newline`, `Spacer`, `Transform`.

## Step 2: Add silvery components

Start using silvery's component library alongside Ink compat. No need to replace everything at once — mix and match.

```typescript
import { Box, Text, useInput } from 'silvery/ink'     // keep Ink compat
import { SelectList, TextInput, ProgressBar } from 'silvery'  // add silvery components
import { useContentRect } from 'silvery'               // add silvery hooks
```

Silvery components you can drop in:

| Ink pattern | Silvery replacement | What you gain |
|---|---|---|
| Manual `useInput` + cursor state | `<SelectList items={...} />` | Built-in j/k/arrows/Enter, scroll, search |
| Manual text input handling | `<TextInput />` | Readline keybindings (Ctrl+A/E/K/U, Alt+B/F) |
| Manual `useState` + `setInterval` | `<ProgressBar />` / `<Spinner />` | Declarative, themed |
| Manual scroll offset tracking | `<ListView />` | Virtual scrolling, 10K+ items |
| Raw ANSI color codes | `$primary`, `$success`, `$muted` | Semantic theme tokens, palette switching |

## Step 3: Replace Ink hooks

Each Ink hook has a silvery equivalent. Replace them one at a time.

### `useInput` → keymap

Ink's `useInput` is imperative — you handle raw keys in a callback. Silvery's keymap is declarative — you bind keys to commands.

```diff
- import { useInput } from 'silvery/ink'
+ import { createApp } from 'silvery'

- useInput((input, key) => {
-   if (input === 'j') setCursor(c => c + 1)
-   if (input === 'k') setCursor(c => c - 1)
-   if (key.return) openItem()
-   if (input === 'q') process.exit(0)
- })

+ const app = createApp()
+ app.commands.nav = {
+   down:   { title: "Move Down",  fn: () => setCursor(c => c + 1) },
+   up:     { title: "Move Up",    fn: () => setCursor(c => c - 1) },
+   open:   { title: "Open",       fn: () => openItem() },
+   quit:   { title: "Quit",       fn: () => process.exit(0) },
+ }
+ app.keymap({
+   j: app.commands.nav.down,
+   k: app.commands.nav.up,
+   Enter: app.commands.nav.open,
+   q: app.commands.nav.quit,
+ })
```

What you gain: commands are testable (`app.commands.nav.down.fn()`), discoverable (auto-generated CLI, command palette, MCP tools), and composable (plugins add commands without touching view code).

### `useApp().exit()` → command

```diff
- import { useApp } from 'silvery/ink'
- const { exit } = useApp()
- exit()

+ app.commands.app.quit.fn()
// or: process.exit(0) in the command's fn
```

### `useFocus` → silvery focus system

```diff
- import { useFocus } from 'silvery/ink'
- const { isFocused } = useFocus({ autoFocus: true })

+ import { useFocusable } from 'silvery'
+ const { isFocused } = useFocusable({ autoFocus: true })
```

Or use `<Box focusScope>` for container-level focus management — no hook needed.

### `useStdin` → `useInput` or keymap

Most `useStdin` usage is for raw input handling. Replace with keymap bindings or silvery's `useInput` hook (which handles escape sequences correctly, unlike Ink's).

## Step 4: Migrate from `render()` to `createApp()`

This is the biggest change — moving from Ink's render-only model to silvery's app framework. Do this when you want commands, keymaps, structured state, or plugin composition.

### Before: render-only (Ink style)

```typescript
import { render } from 'silvery/ink'

function App() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === 'j') setCount(c => c + 1)
    if (input === 'q') process.exit(0)
  })
  return <Text>Count: {count}</Text>
}

render(<App />)
```

### After: createApp (silvery style)

```typescript
import { createApp, signal, Box, Text } from 'silvery'

// State — outside React, testable, shareable
const count = signal(0)

// App — commands, keymaps, rendering
const app = createApp()
app.commands.counter = {
  increment: { title: "Increment", fn: () => count(count() + 1) },
  quit:      { title: "Quit",      fn: () => process.exit(0) },
}
app.keymap({
  j: app.commands.counter.increment,
  q: app.commands.counter.quit,
})

// View — pure renderer, no input handling
function App() {
  const c = useSignal(count)
  return <Text>Count: {c}</Text>
}

await app.run(<App />)
```

### What changes

| Concern | render() | createApp() |
|---|---|---|
| **State** | `useState` inside components | `signal()` outside React — testable, shareable |
| **Input** | `useInput` callback per component | `keymap()` — declarative, composable |
| **Actions** | Inline in `useInput` | Named commands — testable, discoverable |
| **Testing** | Mount component, simulate keys | Call `command.fn()` directly |
| **CLI** | Build separately | Auto-generated from command tree |
| **AI/MCP** | Build separately | Auto-generated from command tree |

### Migration checklist

1. Create the app: `const app = createApp()`
2. Move state out of components: `useState` → `signal()` (optional — useState still works)
3. Move input handling: `useInput` → `app.keymap()` + commands
4. Simplify views: remove input logic, just render state
5. Remove `silvery/ink` imports — use `silvery` directly
6. Remove `withInk()` if you were using it during transition

### You don't have to migrate all at once

`render()` and `createApp()` coexist. You can have some components using `useInput` (Ink style) and others driven by keymaps. Migrate incrementally — one component at a time.

## Hook replacement reference

| Ink hook | Silvery equivalent | Notes |
|---|---|---|
| `useInput(fn)` | `app.keymap()` + commands | Declarative, composable |
| `useApp()` | `app.commands` | Named actions |
| `useFocus()` | `useFocusable()` or `<Box focusScope>` | Container-level focus |
| `useFocusManager()` | Silvery focus system | Tab/Shift+Tab built-in |
| `useStdin()` | `useInput()` from silvery | Better escape handling |
| `useStdout()` | `useContentRect()` | Dimensions + resize |
| `useStderr()` | Rarely needed | — |

## FAQ

**Can I use silvery components inside an Ink compat app?**
Yes. `silvery/ink` and `silvery` components work together in the same tree.

**Do I need signals?**
No. `useState` works fine. Signals are useful when state needs to be shared across components or accessed outside React (commands, tests, CLI). They're optional (Decision 34).

**What about third-party Ink plugins?**
Most work unchanged with `silvery/ink`. If they import from `ink` directly, you may need to alias `ink` → `silvery/ink` in your bundler config.

**Is there a codemod?**
Not yet. The import change (`ink` → `silvery/ink`) is a find-and-replace. The `useInput` → keymap migration requires understanding your app's intent, so it's manual.
