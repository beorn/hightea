# Toggle

A focusable checkbox-style toggle control. Integrates with the silvery focus system and responds to Space key to toggle the value.

## Import

```tsx
import { Toggle } from "silvery"
```

## Props

`ToggleProps` extends `BoxProps` (excluding `children` and `onChange`).

| Prop       | Type                       | Default           | Description               |
| ---------- | -------------------------- | ----------------- | ------------------------- |
| `value`    | `boolean`                  | **required**      | Whether the toggle is on  |
| `onChange` | `(value: boolean) => void` | **required**      | Called when value changes |
| `label`    | `string`                   | --                | Label text                |
| `isActive` | `boolean`                  | from focus system | Whether input is active   |

All `BoxProps` layout and style props are also accepted.

## Rendering

Renders `[x]` when on, `[ ]` when off. When focused, the checkbox indicator is rendered with inverse styling.

## Usage

```tsx
const [enabled, setEnabled] = useState(false)
<Toggle value={enabled} onChange={setEnabled} label="Dark mode" />

// With explicit active control (bypasses focus system)
<Toggle value={on} onChange={setOn} label="Option" isActive={isEditing} />
```

## See Also

- [Button](./Button.md) -- focusable button control
- [Form](./Form.md) -- form layout with fields
