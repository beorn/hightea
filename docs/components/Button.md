# Button

A focusable button control. Integrates with the silvery focus system and responds to Enter or Space key to activate.

## Import

```tsx
import { Button } from "silvery"
```

## Props

`ButtonProps` extends `BoxProps` (excluding `children`).

| Prop       | Type         | Default           | Description                            |
| ---------- | ------------ | ----------------- | -------------------------------------- |
| `label`    | `string`     | **required**      | Button label                           |
| `onPress`  | `() => void` | **required**      | Called when activated (Enter or Space) |
| `isActive` | `boolean`    | from focus system | Whether input is active                |
| `color`    | `string`     | --                | Button color                           |

All `BoxProps` layout and style props are also accepted.

## Rendering

Renders `[ label ]` with inverse styling when focused. Activates on Enter or Space key press.

## Usage

```tsx
<Button label="Save" onPress={() => save()} />
<Button label="Cancel" onPress={() => close()} color="red" />

// With explicit active control (bypasses focus system)
<Button label="OK" onPress={confirm} isActive={hasFocus} />
```

## See Also

- [Toggle](./Toggle.md) -- focusable checkbox-style toggle
- [Form](./Form.md) -- form layout with fields
