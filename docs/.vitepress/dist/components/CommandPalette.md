---
url: /components/CommandPalette.md
---
# CommandPalette

A filterable command list with keyboard navigation. Takes an array of commands with name, description, and optional shortcut. Users type to filter and navigate with arrow keys / j/k. Uses fuzzy matching.

## Import

```tsx
import { CommandPalette } from "silvery"
```

## Props

| Prop          | Type                             | Default                | Description                                   |
| ------------- | -------------------------------- | ---------------------- | --------------------------------------------- |
| `commands`    | `CommandItem[]`                  | **required**           | Available commands                            |
| `onSelect`    | `(command: CommandItem) => void` | --                     | Called when a command is selected (Enter)     |
| `onClose`     | `() => void`                     | --                     | Called when the palette is dismissed (Escape) |
| `placeholder` | `string`                         | `"Search commands..."` | Placeholder text for filter input             |
| `maxVisible`  | `number`                         | `10`                   | Max visible results                           |
| `isActive`    | `boolean`                        | `true`                 | Whether this component captures input         |

### CommandItem

```ts
interface CommandItem {
  name: string // Command display name
  description?: string // Command description
  shortcut?: string // Keyboard shortcut hint
}
```

## Keyboard Shortcuts

| Key             | Action                     |
| --------------- | -------------------------- |
| Printable chars | Filter by name/description |
| Backspace       | Delete last character      |
| Up/Down         | Navigate results           |
| Enter           | Select command             |
| Escape          | Dismiss palette            |

## Usage

```tsx
const commands = [
  { name: "Save", description: "Save current file", shortcut: "Ctrl+S" },
  { name: "Quit", description: "Exit application", shortcut: "Ctrl+Q" },
  { name: "Help", description: "Show help" },
]

<CommandPalette
  commands={commands}
  onSelect={(cmd) => exec(cmd.name)}
  onClose={() => setShowPalette(false)}
  placeholder="Type a command..."
/>
```

## See Also

* [PickerDialog](./PickerDialog.md) -- generic search-and-select dialog
* [SelectList](./SelectList.md) -- simple select list
