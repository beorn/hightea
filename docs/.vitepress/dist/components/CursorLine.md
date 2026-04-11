---
url: /components/CursorLine.md
---
# CursorLine

Renders a single line of text with a visible cursor at a split point. Extracts the duplicated cursor-rendering pattern into a reusable primitive.

## Import

```tsx
import { CursorLine } from "silvery"
```

## Props

| Prop            | Type                       | Default      | Description                                                       |
| --------------- | -------------------------- | ------------ | ----------------------------------------------------------------- |
| `beforeCursor`  | `string`                   | **required** | Text before the cursor position                                   |
| `afterCursor`   | `string`                   | **required** | Text after the cursor position (first char gets cursor highlight) |
| `color`         | `string`                   | --           | Text color                                                        |
| `showCursor`    | `boolean`                  | `true`       | Whether to show the cursor                                        |
| `cursorStyle`   | `"block" \| "underline"`   | `"block"`    | Cursor style                                                      |
| `onCursorClick` | `(offset: number) => void` | --           | Called when clicked, provides character offset                    |

## Behavior

The cursor character is `afterCursor[0]` (or a space when afterCursor is empty, indicating cursor at end of text). The character is rendered with inverse video (block) or underline styling.

## Usage

```tsx
<CursorLine beforeCursor="hel" afterCursor="lo world" />
<CursorLine beforeCursor="full text" afterCursor="" />
<CursorLine beforeCursor="" afterCursor="start" cursorStyle="underline" />
```

## See Also

* [TextInput](./TextInput.md) -- single-line text input
* [EditContextDisplay](./EditContextDisplay.md) -- multi-line display with cursor
