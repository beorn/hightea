---
url: /components/ScrollbackView.md
---
# ScrollbackView

Native scrollback root component. Uses the normal terminal buffer. Children flow vertically. As items scroll off the top, they transition through the virtualization lifecycle and are committed to terminal scrollback.

The user scrolls with their terminal's native scroll (mouse wheel, scrollbar, Shift+PageUp). Text selection is free. Content becomes part of the terminal's permanent history.

## Import

```tsx
import { ScrollbackView } from "silvery"
```

## Props

| Prop           | Type                                           | Default                  | Description                                                    |
| -------------- | ---------------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `items`        | `T[]`                                          | **required**             | Array of items to render                                       |
| `children`     | `(item: T, index: number) => ReactNode`        | --                       | Render function for each item                                  |
| `renderItem`   | `(item: T, index: number) => ReactNode`        | --                       | Alternative render function (prefer for memoization)           |
| `keyExtractor` | `(item: T, index: number) => string \| number` | **required**             | Extract a unique key for each item                             |
| `isFrozen`     | `(item: T, index: number) => boolean`          | --                       | Data-driven frozen predicate                                   |
| `footer`       | `ReactNode`                                    | --                       | Footer pinned at the bottom                                    |
| `maxHistory`   | `number`                                       | `10000`                  | Maximum lines in dynamic scrollback before promoting to static |
| `markers`      | `boolean \| ScrollbackMarkerCallbacks<T>`      | --                       | OSC 133 marker configuration                                   |
| `width`        | `number`                                       | `process.stdout.columns` | Terminal width in columns                                      |
| `stdout`       | `{ write(data: string): boolean }`             | `process.stdout`         | Output stream                                                  |
| `onRecovery`   | `() => void`                                   | --                       | Called on inconsistent state recovery                          |

## Usage

```tsx
<ScrollbackView footer={<StatusBar />}>
  {messages.map(m => <Message key={m.id} data={m} />)}
</ScrollbackView>

// With item-level lifecycle control
<ScrollbackView
  items={tasks}
  keyExtractor={(t) => t.id}
  isFrozen={(t) => t.done}
  footer={<Text>Status bar</Text>}
>
  {(task) => <TaskItem task={task} />}
</ScrollbackView>
```

## See Also

* [ScrollbackList](./ScrollbackList.md) -- thin wrapper with same semantics
* [ListView](./ListView.md) -- app-managed scrolling (no terminal scrollback)
* [Static](./Static.md) -- write-once rendering
* [Dynamic Scrollback](/design/dynamic-scrollback) -- architecture behind scrollback rendering
