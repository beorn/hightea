---
url: /components/Static.md
---
# Static

Renders items that are written once and never updated. Each item is rendered exactly once via the children callback. Previously rendered items are preserved as frozen React elements.

In inline mode, items are promoted to terminal scrollback and removed from the React tree. In fullscreen/test mode, items stay in the tree.

## Import

```tsx
import { Static } from "silvery"
```

## Props

| Prop       | Type                                    | Default      | Description                     |
| ---------- | --------------------------------------- | ------------ | ------------------------------- |
| `items`    | `T[]`                                   | **required** | Items to render                 |
| `children` | `(item: T, index: number) => ReactNode` | **required** | Render function for each item   |
| `style`    | `Record<string, unknown>`               | --           | Style to apply to the container |

## Usage

```tsx
const [logs, setLogs] = useState<string[]>([])

// Logs appear above the main UI and stay visible
<Static items={logs}>
  {(log, index) => <Text key={index}>{log}</Text>}
</Static>

// Main UI continues below
<Box>
  <Text>Current status: processing...</Text>
</Box>
```

## Behavior

* Write-once semantics: when the items array grows, only newly added items (at the end) are rendered. The children callback is not called again for previously rendered items.
* In inline mode: uses `useScrollback` to push items to terminal scrollback.
* In fullscreen/test mode: items remain in the React tree.

## See Also

* [ScrollbackList](./ScrollbackList.md) -- advanced scrollback management
* [ScrollbackView](./ScrollbackView.md) -- native scrollback root
