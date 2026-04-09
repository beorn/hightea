/**
 * Spatial Focus Navigation Demo — Kanban Board
 *
 * A kanban board where arrow keys spatially navigate between cards across columns.
 * Demonstrates silvery's focusDirection API with cone-based nearest-neighbor lookup.
 *
 * Cards have varied heights to prove spatial focus handles non-uniform layouts.
 * Focus is shown via yellow border and bold title on the focused card.
 *
 * Run: bun vendor/silvery/examples/apps/spatial-focus-demo.tsx
 */

import React, { useCallback, useContext } from "react"
import { Box, Text, useFocusable, useFocusManager } from "../../src/index.js"
import { run, useInput, type Key } from "@silvery/ag-term/runtime"
import { FocusManagerContext, NodeContext } from "@silvery/ag-react/context"
import type { AgNode, Rect } from "@silvery/ag/types"

// ============================================================================
// Data
// ============================================================================

interface CardData {
  id: string
  title: string
  description?: string
  tags: string[]
  priority?: "low" | "medium" | "high"
}

interface ColumnData {
  id: string
  title: string
  cards: CardData[]
}

const columns: ColumnData[] = [
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      { id: "b1", title: "Design system audit", tags: ["design"], priority: "low" },
      {
        id: "b2",
        title: "Refactor auth module",
        description: "Move from JWT to session-based auth.\nUpdate all middleware.\nAdd refresh token rotation.",
        tags: ["backend", "security"],
        priority: "high",
      },
      { id: "b3", title: "Add dark mode", tags: ["frontend"] },
      {
        id: "b4",
        title: "Database migration tool",
        description: "Schema versioning with rollback support.",
        tags: ["backend", "devops"],
        priority: "medium",
      },
      { id: "b5", title: "Update dependencies", tags: ["maintenance"] },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    cards: [
      {
        id: "t1",
        title: "User dashboard",
        description: "Activity feed, stats overview,\nrecent projects, and quick actions.",
        tags: ["frontend", "ux"],
        priority: "high",
      },
      { id: "t2", title: "API rate limiting", tags: ["backend"], priority: "medium" },
      {
        id: "t3",
        title: "E2E test suite",
        description: "Cover critical user flows:\n- Login/signup\n- Project CRUD\n- Team management\n- Billing",
        tags: ["testing"],
        priority: "high",
      },
      { id: "t4", title: "Webhook support", tags: ["backend", "api"] },
    ],
  },
  {
    id: "progress",
    title: "In Progress",
    cards: [
      {
        id: "p1",
        title: "Search feature",
        description: "Full-text search with filters.",
        tags: ["frontend", "backend"],
        priority: "high",
      },
      { id: "p2", title: "Fix memory leak", tags: ["bug"], priority: "high" },
      {
        id: "p3",
        title: "CI/CD pipeline",
        description: "GitHub Actions workflow:\n- Lint + typecheck\n- Unit tests\n- E2E tests\n- Deploy to staging",
        tags: ["devops"],
        priority: "medium",
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: "d1", title: "Project setup", tags: ["devops"] },
      {
        id: "d2",
        title: "Auth system",
        description: "Login, signup, password reset,\nOAuth providers.",
        tags: ["backend", "security"],
      },
      { id: "d3", title: "Landing page", tags: ["frontend", "design"] },
    ],
  },
]

// ============================================================================
// Tag colors
// ============================================================================

const tagColors: Record<string, string> = {
  frontend: "$info",
  backend: "$accent",
  design: "$warning",
  devops: "$success",
  testing: "$primary",
  ux: "$muted",
  security: "$error",
  bug: "$error",
  api: "$primary",
  maintenance: "$muted",
}

const prioritySymbols: Record<string, { symbol: string; color: string }> = {
  high: { symbol: "▲", color: "$error" },
  medium: { symbol: "◆", color: "$warning" },
  low: { symbol: "▽", color: "$muted" },
}

// ============================================================================
// Components
// ============================================================================

function Tag({ name }: { name: string }) {
  const color = tagColors[name] ?? "$muted"
  return (
    <Text color={color} dim>
      #{name}
    </Text>
  )
}

function CardView({ card, autoFocus }: { card: CardData; autoFocus?: boolean }) {
  const { focused } = useFocusable()
  const priority = card.priority ? prioritySymbols[card.priority] : null

  return (
    <Box
      testID={card.id}
      focusable
      autoFocus={autoFocus}
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? "$warning" : "$border"}
    >
      <Box paddingX={1} gap={1}>
        {priority && <Text color={priority.color}>{priority.symbol}</Text>}
        <Text bold={focused} color={focused ? "$warning" : "$text"} wrap="truncate">
          {card.title}
        </Text>
      </Box>
      {card.description && (
        <Box paddingX={1}>
          <Text color="$muted" dim wrap="truncate">
            {card.description}
          </Text>
        </Box>
      )}
      <Box gap={1} paddingX={1}>
        {card.tags.map((tag) => (
          <Tag key={tag} name={tag} />
        ))}
      </Box>
    </Box>
  )
}

function ColumnView({
  column,
  hasFocus,
  autoFocusFirst,
}: {
  column: ColumnData
  hasFocus: boolean
  autoFocusFirst?: boolean
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle="single"
      borderColor={hasFocus ? "$warning" : "$border"}
    >
      <Box backgroundColor={hasFocus ? "$warning" : undefined} paddingX={1}>
        <Text bold color={hasFocus ? "$warning-fg" : "$text"}>
          {column.title}
        </Text>
        <Text color={hasFocus ? "$warning-fg" : "$muted"}> ({column.cards.length})</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {column.cards.map((card, i) => (
          <CardView key={card.id} card={card} autoFocus={autoFocusFirst && i === 0} />
        ))}
        {column.cards.length === 0 && (
          <Text dim italic>
            No cards
          </Text>
        )}
      </Box>
    </Box>
  )
}

function StatusBar() {
  const { activeId } = useFocusManager()

  // Find which column contains the focused card
  let focusedColumn: string | null = null
  let focusedCard: CardData | null = null
  for (const col of columns) {
    const card = col.cards.find((c) => c.id === activeId)
    if (card) {
      focusedColumn = col.title
      focusedCard = card
      break
    }
  }

  return (
    <Box paddingX={1} gap={2}>
      <Text color="$muted" dim>
        ←↑↓→ spatial nav
      </Text>
      <Text color="$muted" dim>
        Tab/Shift+Tab linear
      </Text>
      <Text color="$muted" dim>
        q quit
      </Text>
      {focusedCard && (
        <>
          <Text color="$border">│</Text>
          <Text color="$warning">{focusedColumn}</Text>
          <Text color="$muted">→</Text>
          <Text color="$text">{focusedCard.title}</Text>
        </>
      )}
    </Box>
  )
}

function SpatialFocusBoard() {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)
  const { activeId } = useFocusManager()

  const getRoot = useCallback((): AgNode | null => {
    if (!node) return null
    let root = node
    while (root.parent) root = root.parent
    return root
  }, [node])

  useInput((input: string, key: Key) => {
    if (input === "q") return "exit"

    if (!fm) return

    const root = getRoot()
    if (!root) return

    // Arrow keys → spatial focus navigation
    if (key.upArrow) {
      fm.focusDirection(root, "up")
      return
    }
    if (key.downArrow) {
      fm.focusDirection(root, "down")
      return
    }
    if (key.leftArrow) {
      fm.focusDirection(root, "left")
      return
    }
    if (key.rightArrow) {
      fm.focusDirection(root, "right")
      return
    }
  })

  // Determine which column has focus
  const focusedColumnId = activeId
    ? (columns.find((col) => col.cards.some((c) => c.id === activeId))?.id ?? null)
    : null

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box marginBottom={1} paddingX={1} gap={1}>
        <Text bold color="$warning">
          Spatial Focus
        </Text>
        <Text color="$muted">— arrow keys navigate by screen position (cone-based nearest neighbor)</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {columns.map((column, i) => (
          <ColumnView
            key={column.id}
            column={column}
            hasFocus={column.id === focusedColumnId}
            autoFocusFirst={i === 0}
          />
        ))}
      </Box>

      <StatusBar />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export const meta = {
  name: "Spatial Focus",
  description: "Kanban board with spatial focus navigation — arrow keys find nearest card by screen position",
  demo: true,
  features: ["focusDirection", "cone-based spatial nav", "focusable", "useFocusable", "kanban layout"],
}

if (import.meta.main) {
  using handle = await run(<SpatialFocusBoard />, { mode: "fullscreen" })
  await handle.waitUntilExit()
}
