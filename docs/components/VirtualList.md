# VirtualList

> **Deprecated**: Use [ListView](./ListView.md) instead. VirtualList is now a thin wrapper that maps old prop names to ListView.

React-level virtualization for long lists. Only renders items within the visible viewport plus overscan.

## Import

```tsx
import { VirtualList } from "silvery"
```

## Props

| Prop                    | Type                                                     | Default      | Description                                            |
| ----------------------- | -------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| `items`                 | `T[]`                                                    | **required** | Array of items to render                               |
| `height`                | `number`                                                 | **required** | Height of the list viewport in rows                    |
| `renderItem`            | `(item: T, index: number, meta?: ItemMeta) => ReactNode` | **required** | Render function for each item                          |
| `itemHeight`            | `number \| ((item: T, index: number) => number)`         | `1`          | Height of each item in rows                            |
| `scrollTo`              | `number`                                                 | --           | Index to keep visible. Ignored when `interactive=true` |
| `overscan`              | `number`                                                 | `5`          | Extra items to render above/below viewport             |
| `maxRendered`           | `number`                                                 | `100`        | Maximum items to render at once                        |
| `overflowIndicator`     | `boolean`                                                | --           | Show overflow indicators                               |
| `keyExtractor`          | `(item: T, index: number) => string \| number`           | index        | Key extractor                                          |
| `width`                 | `number`                                                 | --           | Width of the list                                      |
| `gap`                   | `number`                                                 | `0`          | Gap between items in rows                              |
| `renderSeparator`       | `() => ReactNode`                                        | --           | Render separator between items                         |
| `virtualized`           | `(item: T, index: number) => boolean`                    | --           | Predicate for items already virtualized                |
| `interactive`           | `boolean`                                                | --           | Enable built-in keyboard and mouse wheel               |
| `selectedIndex`         | `number`                                                 | --           | Currently selected index (controlled)                  |
| `onSelectionChange`     | `(index: number) => void`                                | --           | Called when selection changes                          |
| `onSelect`              | `(index: number) => void`                                | --           | Called when Enter is pressed                           |
| `onEndReached`          | `() => void`                                             | --           | Called when visible range nears end                    |
| `onEndReachedThreshold` | `number`                                                 | `5`          | Items from end to trigger onEndReached                 |
| `listFooter`            | `ReactNode`                                              | --           | Content rendered after all items                       |

### ItemMeta

```ts
interface ItemMeta {
  isSelected: boolean
}
```

### Ref: VirtualListHandle

```ts
interface VirtualListHandle {
  scrollToItem(index: number): void
}
```

## Prop Mapping to ListView

| VirtualList             | ListView                  |
| ----------------------- | ------------------------- |
| `interactive`           | `navigable`               |
| `selectedIndex`         | `cursorIndex`             |
| `onSelectionChange`     | `onCursorIndexChange`     |
| `keyExtractor`          | `getKey`                  |
| `itemHeight`            | `estimateHeight`          |
| `isSelected` (ItemMeta) | `isCursor` (ListItemMeta) |

## See Also

- [ListView](./ListView.md) -- the replacement component
