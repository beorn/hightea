/**
 * TreeView Component
 *
 * Expandable/collapsible hierarchical data display with keyboard navigation.
 * Thin composition over ListView — flattens the tree, delegates navigation
 * and virtualization, adds expand/collapse and indentation.
 *
 * Usage:
 * ```tsx
 * const data: TreeNode[] = [
 *   {
 *     id: "1",
 *     label: "Documents",
 *     children: [
 *       { id: "1.1", label: "README.md" },
 *       { id: "1.2", label: "notes.txt" },
 *     ],
 *   },
 *   { id: "2", label: "config.json" },
 * ]
 *
 * <TreeView data={data} renderNode={(node) => <Text>{node.label}</Text>} />
 * ```
 */
import React, { useCallback, useMemo, useRef, useState } from "react"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { ListView } from "./ListView"

// =============================================================================
// Types
// =============================================================================

export interface TreeNode {
  /** Unique identifier for this node */
  id: string
  /** Display label */
  label: string
  /** Child nodes (optional) */
  children?: TreeNode[]
}

export interface TreeViewProps {
  /** Hierarchical data to display */
  data: TreeNode[]
  /** Custom node renderer (default: renders label text) */
  renderNode?: (node: TreeNode, depth: number) => React.ReactNode
  /** Controlled: set of expanded node IDs */
  expandedIds?: Set<string>
  /** Called when expansion state changes */
  onToggle?: (nodeId: string, expanded: boolean) => void
  /** Whether nodes start expanded (default: false) */
  defaultExpanded?: boolean
  /** Whether this component captures input (default: true) */
  isActive?: boolean
  /** Indent per level in characters (default: 2) */
  indent?: number
  /** Height of the viewport in rows. When omitted, renders all items (no virtualization). */
  height?: number
}

// =============================================================================
// Helpers
// =============================================================================

/** A flattened tree item with its source node and depth. */
interface FlatItem {
  node: TreeNode
  depth: number
}

/** Flatten tree into visible list based on expansion state. */
function flattenTree(nodes: TreeNode[], expanded: Set<string>, depth: number = 0): FlatItem[] {
  const result: FlatItem[] = []
  for (const node of nodes) {
    result.push({ node, depth })
    if (node.children?.length && expanded.has(node.id)) {
      result.push(...flattenTree(node.children, expanded, depth + 1))
    }
  }
  return result
}

/** Collect all node IDs in the tree (for defaultExpanded). */
function collectAllIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    ids.add(node.id)
    if (node.children) {
      for (const id of collectAllIds(node.children)) {
        ids.add(id)
      }
    }
  }
  return ids
}

// =============================================================================
// Component
// =============================================================================

/**
 * Expandable/collapsible tree view built on ListView.
 *
 * ListView handles: cursor movement (j/k, arrows, PgUp/PgDn), scrolling,
 * mouse wheel, virtualization, and search.
 *
 * TreeView adds: tree flattening, indentation, expand/collapse (Enter,
 * Right on collapsed, Left on expanded).
 */
export function TreeView({
  data,
  renderNode,
  expandedIds: controlledExpanded,
  onToggle,
  defaultExpanded = false,
  isActive = true,
  indent = 2,
  height,
}: TreeViewProps): React.ReactElement {
  const isControlled = controlledExpanded !== undefined

  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<Set<string>>(() =>
    defaultExpanded ? collectAllIds(data) : new Set(),
  )

  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded

  // Cursor tracked via ref (updated by ListView's onCursor) to avoid
  // re-renders on every cursor move. Only expand/collapse reads it.
  const cursorRef = useRef(0)

  const flatItems = useMemo(() => flattenTree(data, expanded), [data, expanded])

  const toggleNode = useCallback(
    (nodeId: string) => {
      const wasExpanded = expanded.has(nodeId)
      if (!isControlled) {
        setUncontrolledExpanded((prev) => {
          const next = new Set(prev)
          if (wasExpanded) next.delete(nodeId)
          else next.add(nodeId)
          return next
        })
      }
      onToggle?.(nodeId, !wasExpanded)
    },
    [expanded, isControlled, onToggle],
  )

  // Right arrow → expand collapsed branch, Left arrow → collapse expanded branch.
  // ListView handles j/k/↑/↓/PgUp/PgDn/Home/End/G; we add only tree-specific keys.
  useInput(
    (_input, key) => {
      if (flatItems.length === 0) return
      const cursor = Math.min(cursorRef.current, flatItems.length - 1)
      const item = flatItems[cursor]
      if (!item?.node.children?.length) return

      if (key.rightArrow && !expanded.has(item.node.id)) {
        toggleNode(item.node.id)
      } else if (key.leftArrow && expanded.has(item.node.id)) {
        toggleNode(item.node.id)
      }
    },
    { isActive },
  )

  // Enter on a branch node → toggle expand/collapse (via ListView's onSelect).
  const handleSelect = useCallback(
    (index: number) => {
      const item = flatItems[index]
      if (item?.node.children?.length) {
        toggleNode(item.node.id)
      }
    },
    [flatItems, toggleNode],
  )

  const handleCursor = useCallback((index: number) => {
    cursorRef.current = index
  }, [])

  const getKey = useCallback((item: FlatItem) => item.node.id, [])

  const renderTreeItem = useCallback(
    (item: FlatItem, _index: number, meta: { isCursor: boolean }) => {
      const hasChildren = !!item.node.children?.length
      const isExpanded = expanded.has(item.node.id)
      const prefix = hasChildren ? (isExpanded ? "v " : "> ") : "  "
      const padding = " ".repeat(item.depth * indent)

      return (
        <Text inverse={meta.isCursor}>
          {padding}
          <Text color={hasChildren ? "$fg-accent" : "$fg"}>{prefix}</Text>
          {renderNode ? renderNode(item.node, item.depth) : <Text>{item.node.label}</Text>}
        </Text>
      )
    },
    [expanded, indent, renderNode],
  )

  if (flatItems.length === 0) {
    return (
      <Box>
        <Text color="$fg-muted">No items</Text>
      </Box>
    )
  }

  return (
    <ListView
      items={flatItems}
      height={height ?? flatItems.length}
      nav
      active={isActive}
      onCursor={handleCursor}
      onSelect={handleSelect}
      renderItem={renderTreeItem}
      getKey={getKey}
      estimateHeight={1}
    />
  )
}
