# PickerDialog

Generic search-and-select dialog combining ModalDialog + text input + scrolling result list. Handles keyboard routing: arrows for selection, Enter to confirm, Esc to cancel, printable chars for filtering.

## Import

```tsx
import { PickerDialog } from "silvery"
```

## Props

| Prop           | Type                                        | Default      | Description                                    |
| -------------- | ------------------------------------------- | ------------ | ---------------------------------------------- |
| `title`        | `string`                                    | **required** | Dialog title                                   |
| `items`        | `T[]`                                       | **required** | Items to display in the result list            |
| `renderItem`   | `(item: T, selected: boolean) => ReactNode` | **required** | Render function for each item                  |
| `keyExtractor` | `(item: T) => string`                       | **required** | Unique key for each item                       |
| `onSelect`     | `(item: T) => void`                         | **required** | Called when an item is confirmed (Enter)       |
| `onCancel`     | `() => void`                                | **required** | Called when the dialog is cancelled (Esc)      |
| `onChange`     | `(query: string) => void`                   | --           | Called when input text changes (for filtering) |
| `placeholder`  | `string`                                    | --           | Placeholder text when input is empty           |
| `initialValue` | `string`                                    | `""`         | Initial input value                            |
| `emptyMessage` | `string`                                    | `"No items"` | Message when items list is empty               |
| `maxVisible`   | `number`                                    | `10`         | Maximum visible items before scrolling         |
| `width`        | `number`                                    | --           | Dialog width                                   |
| `height`       | `number`                                    | --           | Dialog height (auto-sized if omitted)          |
| `footer`       | `ReactNode`                                 | --           | Footer content                                 |
| `prompt`       | `string`                                    | --           | Input prompt prefix (e.g., "/ ")               |
| `promptColor`  | `string`                                    | --           | Prompt color                                   |
| `isActive`     | `boolean`                                   | `true`       | Whether the input is active                    |

## Keyboard Routing

| Key              | Action                          |
| ---------------- | ------------------------------- |
| Printable chars  | Filter input (readline editing) |
| Ctrl+A/E/K/U/W/Y | Readline shortcuts              |
| Up/Down          | Navigate result list            |
| PgUp/PgDn        | Scroll by page                  |
| Enter            | Confirm selected item           |
| Esc              | Cancel dialog                   |

## Usage

```tsx
<PickerDialog
  title="Search"
  items={filteredResults}
  renderItem={(item, selected) => <Text inverse={selected}>{item.name}</Text>}
  keyExtractor={(item) => item.id}
  onSelect={(item) => navigateTo(item)}
  onCancel={() => closeDialog()}
  onChange={(query) => setFilter(query)}
  placeholder="Type to search..."
/>
```

## See Also

- [PickerList](./PickerList.md) -- standalone scrolling result list
- [ModalDialog](./ModalDialog.md) -- base dialog component
- [CommandPalette](./CommandPalette.md) -- filterable command list
