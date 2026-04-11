---
url: /components/Spacer.md
---
# Spacer

A flexible space that expands to fill available space. Renders a Box with `flexGrow={1}`. Useful for pushing elements to opposite ends of a container.

## Import

```tsx
import { Spacer } from "silvery"
```

## Props

None.

## Usage

```tsx
// Push "Right" to the end
<Box flexDirection="row">
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>

// Center element with equal spacing
<Box flexDirection="row">
  <Spacer />
  <Text>Centered</Text>
  <Spacer />
</Box>
```

## See Also

* [Box](./Box.md) -- layout container
* [Newline](./Newline.md) -- vertical spacing
