# Screen

Fullscreen root component. Claims the full terminal dimensions for flexbox layout. Tracks terminal resize events to stay in sync. This is the declarative equivalent of the implicit fullscreen mode from `run()`/`createApp()`.

## Import

```tsx
import { Screen } from "silvery"
```

## Props

| Prop            | Type                                                     | Default      | Description                               |
| --------------- | -------------------------------------------------------- | ------------ | ----------------------------------------- |
| `children`      | `ReactNode`                                              | **required** | Children to render in the fullscreen area |
| `flexDirection` | `"row" \| "column" \| "row-reverse" \| "column-reverse"` | `"column"`   | Flex direction for layout                 |

## Usage

```tsx
<Screen>
  <Sidebar />
  <MainContent />
  <StatusBar />
</Screen>

// Fullscreen + scrollable region
<Screen>
  <Sidebar />
  <ListView items={logs} height={20} renderItem={...} />
  <StatusBar />
</Screen>
```

## See Also

- [Box](./Box.md) -- base layout container
- [SplitView](./SplitView.md) -- multi-pane layout
