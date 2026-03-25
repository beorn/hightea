# Newline

Renders one or more newline characters. Useful for adding vertical spacing in text content.

## Import

```tsx
import { Newline } from "silvery"
```

## Props

| Prop    | Type     | Default | Description                  |
| ------- | -------- | ------- | ---------------------------- |
| `count` | `number` | `1`     | Number of newlines to render |

## Usage

```tsx
<Text>Line 1</Text>
<Newline />
<Text>Line 3 (after blank line)</Text>

<Newline count={2} />
```

## See Also

- [Spacer](./Spacer.md) -- fills available space in a flex container
