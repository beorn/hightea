---
url: /components/Transform.md
---
# Transform

Applies a string transformation to each line of rendered text output. Compatible with Ink's Transform component.

## Import

```tsx
import { Transform } from "silvery"
```

## Props

| Prop        | Type                                      | Default      | Description                                  |
| ----------- | ----------------------------------------- | ------------ | -------------------------------------------- |
| `transform` | `(line: string, index: number) => string` | **required** | Function that transforms each line of output |
| `children`  | `ReactNode`                               | --           | Text content to transform                    |

## Usage

```tsx
// Uppercase all text
<Transform transform={output => output.toUpperCase()}>
  <Text>Hello World</Text>
</Transform>

// Add line numbers
<Transform transform={(line, index) => `${index + 1}: ${line}`}>
  <Text>First line{'\n'}Second line</Text>
</Transform>
```

## Notes

Transform must be applied only to Text children and should not change the dimensions of the output -- otherwise layout will be incorrect.

## See Also

* [Text](./Text.md) -- text rendering primitive
