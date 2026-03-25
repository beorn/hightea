# TreeView

Expandable/collapsible hierarchical data display with keyboard navigation. Each node can have children, and the tree supports controlled or uncontrolled expansion state.

## Import

```tsx
import { TreeView } from "silvery"
```

## Props

| Prop              | Type                                           | Default              | Description                           |
| ----------------- | ---------------------------------------------- | -------------------- | ------------------------------------- |
| `data`            | `TreeNode[]`                                   | **required**         | Hierarchical data to display          |
| `renderNode`      | `(node: TreeNode, depth: number) => ReactNode` | renders `node.label` | Custom node renderer                  |
| `expandedIds`     | `Set<string>`                                  | --                   | Controlled: set of expanded node IDs  |
| `onToggle`        | `(nodeId: string, expanded: boolean) => void`  | --                   | Called when expansion state changes   |
| `defaultExpanded` | `boolean`                                      | `false`              | Whether nodes start expanded          |
| `isActive`        | `boolean`                                      | `true`               | Whether this component captures input |
| `indent`          | `number`                                       | `2`                  | Indent per level in characters        |

### TreeNode

```ts
interface TreeNode {
  id: string // Unique identifier
  label: string // Display label
  children?: TreeNode[] // Child nodes (optional)
}
```

## Keyboard Shortcuts

| Key      | Action                 |
| -------- | ---------------------- |
| j / Down | Move cursor down       |
| k / Up   | Move cursor up         |
| Enter    | Toggle expand/collapse |
| Right    | Expand (if collapsed)  |
| Left     | Collapse (if expanded) |

## Usage

```tsx
const data: TreeNode[] = [
  {
    id: "1",
    label: "Documents",
    children: [
      { id: "1.1", label: "README.md" },
      { id: "1.2", label: "notes.txt" },
    ],
  },
  { id: "2", label: "config.json" },
]

<TreeView data={data} renderNode={(node) => <Text>{node.label}</Text>} />

// Start expanded
<TreeView data={data} defaultExpanded />

// Controlled expansion
<TreeView
  data={data}
  expandedIds={expanded}
  onToggle={(id, exp) => setExpanded(prev => {
    const next = new Set(prev)
    exp ? next.add(id) : next.delete(id)
    return next
  })}
/>
```

## See Also

- [SelectList](./SelectList.md) -- flat select list
- [ListView](./ListView.md) -- virtualized flat list
