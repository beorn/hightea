# Skeleton

Loading placeholder with configurable dimensions and shape. Renders a block of placeholder characters to indicate content that is loading or not yet available.

## Import

```tsx
import { Skeleton } from "silvery"
```

## Props

| Prop     | Type                            | Default          | Description           |
| -------- | ------------------------------- | ---------------- | --------------------- |
| `width`  | `number`                        | `20`             | Width in columns      |
| `height` | `number`                        | `1`              | Height in rows        |
| `char`   | `string`                        | `"░"`            | Placeholder character |
| `shape`  | `"line" \| "block" \| "circle"` | auto from height | Shape hint            |

### Shape Behavior

- **`line`**: Single row of placeholder characters (default when height=1)
- **`block`**: Multiple rows of placeholder characters (default when height>1)
- **`circle`**: Shorter, centered row for avatar-style placeholders

## Usage

```tsx
<Skeleton width={20} />
<Skeleton width={30} height={3} />
<Skeleton width={10} shape="circle" />
```

## See Also

- [Spinner](./Spinner.md) -- animated loading indicator
- [ProgressBar](./ProgressBar.md) -- progress indicator
