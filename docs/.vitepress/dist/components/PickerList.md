---
url: /components/PickerList.md
---
# PickerList

Standalone scrolling result list with selection highlighting. Extracted from PickerDialog so it can be composed independently by callers that manage their own input.

## Import

```tsx
import { PickerList } from "silvery"
```

## Props

| Prop            | Type                                        | Default      | Description                               |
| --------------- | ------------------------------------------- | ------------ | ----------------------------------------- |
| `items`         | `T[]`                                       | **required** | Items to display                          |
| `selectedIndex` | `number`                                    | **required** | Currently selected index (caller-managed) |
| `renderItem`    | `(item: T, selected: boolean) => ReactNode` | **required** | Render function for each item             |
| `keyExtractor`  | `(item: T) => string`                       | **required** | Unique key for each item                  |
| `emptyMessage`  | `string`                                    | `"No items"` | Message when items list is empty          |
| `maxVisible`    | `number`                                    | `10`         | Maximum visible items before scrolling    |

## Behavior

* Centers the selected item in the visible window
* Handles scroll offset calculation
* Does NOT handle keyboard navigation (caller manages `selectedIndex`)
* Does NOT handle input/search (caller's responsibility)

## Usage

```tsx
<PickerList
  items={filteredResults}
  selectedIndex={selected}
  renderItem={(item, sel) => <Text inverse={sel}>{item.name}</Text>}
  keyExtractor={(item) => item.id}
/>
```

## See Also

* [PickerDialog](./PickerDialog.md) -- full search-and-select dialog
* [SelectList](./SelectList.md) -- self-contained select list with keyboard
