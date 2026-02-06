# Hooks

## useContentRect

Returns the content area dimensions (excluding padding and borders) of the nearest Box ancestor.

```tsx
import { useContentRect } from "inkx"

function ResponsiveCard() {
  const { width, height, x, y } = useContentRect()
  return <Text>{`Content area: ${width}x${height} at (${x},${y})`}</Text>
}
```

This is inkx's core innovation — components know their size _during_ render, not after.

## useScreenRect

Returns the absolute screen position and dimensions.

```tsx
import { useScreenRect } from "inkx"

function Tooltip() {
  const { x, y, width, height } = useScreenRect()
  // Position tooltip relative to screen coordinates
}
```

## useInput

Registers a keyboard input handler. Return `"exit"` to exit the app.

```tsx
import { useInput, type Key } from "inkx/runtime"

function App() {
  useInput((input: string, key: Key) => {
    if (input === "j" || key.downArrow) moveCursor(1)
    if (input === "k" || key.upArrow) moveCursor(-1)
    if (input === "q") return "exit"
  })
}
```

### Key Object

```typescript
interface Key {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageUp: boolean
  pageDown: boolean
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}
```

## useApp

Access app-level controls:

```tsx
import { useApp } from "inkx"

function App() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") exit()
  })
}
```

With Layer 3 (createApp), `useApp` also accesses the Zustand store:

```tsx
const cursor = useApp((s) => s.cursor)
```

## useTerm

Access terminal capabilities and styling:

```tsx
import { useTerm } from "inkx"

function StatusLine() {
  const term = useTerm()

  return (
    <Text>
      {term.hasColor() ? term.green("OK") : "OK"}
      {` ${term.cols}x${term.rows}`}
    </Text>
  )
}
```

## useFocus

Manage focus for interactive components:

```tsx
import { useFocus } from "inkx"

function ListItem({ id }) {
  const { isFocused } = useFocus({ id })
  return <Text color={isFocused ? "blue" : undefined}>{id}</Text>
}
```
