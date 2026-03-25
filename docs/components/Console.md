# Console

Renders captured console output from a `PatchedConsole`. Subscribes to entries via the `useConsole` hook and re-renders when new entries arrive.

## Import

```tsx
import { Console } from "silvery"
```

## Props

| Prop       | Type                                                | Default      | Description                                |
| ---------- | --------------------------------------------------- | ------------ | ------------------------------------------ |
| `console`  | `PatchedConsole`                                    | **required** | The patched console to render entries from |
| `children` | `(entry: ConsoleEntry, index: number) => ReactNode` | --           | Optional custom render function per entry  |

## Usage

```tsx
// Default rendering (colored by stream)
import { patchConsole } from '@silvery/chalk'

using patched = patchConsole(console)
<Console console={patched} />

// Custom rendering
<Console console={patched}>
  {(entry, i) => (
    <Text key={i} color={entry.stream === 'stderr' ? 'yellow' : 'green'}>
      [{entry.method}] {entry.args.join(' ')}
    </Text>
  )}
</Console>
```

## Default Rendering

Without a children render function, entries are rendered as plain text. Stderr entries are colored red.

## See Also

- [Static](./Static.md) -- write-once rendering for logs
