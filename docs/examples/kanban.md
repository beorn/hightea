---
prev:
  text: Task List
  link: /examples/task-list
next:
  text: AI Assistants
  link: /examples/ai-assistants
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Kanban Board Example

A multi-column kanban board with independent scroll regions.

[[toc]]

## Live Demo

<LiveDemo xtermSrc="/examples/showcase.html?demo=kanban" :height="500" />

## What It Demonstrates

- **Multiple scroll regions** - Each column scrolls independently
- **Flex-based column layout** with proportional `flexGrow`
- **Cross-column navigation** with arrow keys
- **Moving items between columns**
- **State management** for cursor position

## Running the Example

```bash
cd silvery
bun run examples/kanban/app.tsx
```

## Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useInput, useApp, createTerm } from "silvery"
import { useState } from "react"

interface Card {
  id: string
  title: string
  tags?: string[]
}

interface Column {
  id: string
  name: string
  cards: Card[]
}

const initialColumns: Column[] = [
  {
    id: "todo",
    name: "To Do",
    cards: [
      { id: "1", title: "Research competitors", tags: ["research"] },
      { id: "2", title: "Design system audit", tags: ["design"] },
      { id: "3", title: "Write API documentation", tags: ["docs"] },
      { id: "4", title: "Performance benchmarks", tags: ["dev"] },
      { id: "5", title: "User interviews", tags: ["research"] },
    ],
  },
  {
    id: "doing",
    name: "In Progress",
    cards: [
      { id: "6", title: "Implement scroll hook", tags: ["dev"] },
      { id: "7", title: "Scrolling component", tags: ["dev"] },
      { id: "8", title: "Write migration guide", tags: ["docs"] },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [
      { id: "9", title: "Initial project setup" },
      { id: "10", title: "Yoga integration" },
      { id: "11", title: "React reconciler" },
      { id: "12", title: "Basic Box component" },
      { id: "13", title: "Text component" },
      { id: "14", title: "useInput hook" },
      { id: "15", title: "Border rendering" },
      { id: "16", title: "Flexbox layout" },
    ],
  },
]

interface CursorPosition {
  columnIndex: number
  cardIndex: number
}

function App() {
  const { exit } = useApp()
  const [columns, setColumns] = useState(initialColumns)
  const [cursor, setCursor] = useState<CursorPosition>({
    columnIndex: 0,
    cardIndex: 0,
  })

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit()
    }

    const currentColumn = columns[cursor.columnIndex]
    const maxCardIndex = Math.max(0, currentColumn.cards.length - 1)

    if (input === "j" || key.downArrow) {
      setCursor((c) => ({
        ...c,
        cardIndex: Math.min(c.cardIndex + 1, maxCardIndex),
      }))
    }

    if (input === "k" || key.upArrow) {
      setCursor((c) => ({
        ...c,
        cardIndex: Math.max(c.cardIndex - 1, 0),
      }))
    }

    if (input === "l" || key.rightArrow) {
      setCursor((c) => {
        const newColIndex = Math.min(c.columnIndex + 1, columns.length - 1)
        const newColCards = columns[newColIndex].cards.length
        return {
          columnIndex: newColIndex,
          cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
        }
      })
    }

    if (input === "h" || key.leftArrow) {
      setCursor((c) => {
        const newColIndex = Math.max(c.columnIndex - 1, 0)
        const newColCards = columns[newColIndex].cards.length
        return {
          columnIndex: newColIndex,
          cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
        }
      })
    }

    if (input === "m" || key.return) {
      moveCardRight()
    }

    if (input === "M") {
      moveCardLeft()
    }
  })

  function moveCardRight() {
    if (cursor.columnIndex >= columns.length - 1) return

    const sourceCol = columns[cursor.columnIndex]
    if (sourceCol.cards.length === 0) return

    const card = sourceCol.cards[cursor.cardIndex]
    const targetColIndex = cursor.columnIndex + 1

    setColumns((cols) =>
      cols.map((col, i) => {
        if (i === cursor.columnIndex) {
          return { ...col, cards: col.cards.filter((c) => c.id !== card.id) }
        }
        if (i === targetColIndex) {
          return { ...col, cards: [...col.cards, card] }
        }
        return col
      }),
    )

    setCursor((c) => ({
      ...c,
      cardIndex: Math.min(c.cardIndex, Math.max(0, sourceCol.cards.length - 2)),
    }))
  }

  function moveCardLeft() {
    if (cursor.columnIndex <= 0) return

    const sourceCol = columns[cursor.columnIndex]
    if (sourceCol.cards.length === 0) return

    const card = sourceCol.cards[cursor.cardIndex]
    const targetColIndex = cursor.columnIndex - 1

    setColumns((cols) =>
      cols.map((col, i) => {
        if (i === cursor.columnIndex) {
          return { ...col, cards: col.cards.filter((c) => c.id !== card.id) }
        }
        if (i === targetColIndex) {
          return { ...col, cards: [...col.cards, card] }
        }
        return col
      }),
    )

    setCursor((c) => ({
      ...c,
      cardIndex: Math.min(c.cardIndex, Math.max(0, sourceCol.cards.length - 2)),
    }))
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Board columns={columns} cursor={cursor} />
      <HelpBar />
    </Box>
  )
}

function Board({ columns, cursor }: { columns: Column[]; cursor: CursorPosition }) {
  return (
    <Box flexDirection="row" flexGrow={1}>
      {columns.map((column, colIndex) => (
        <KanbanColumn
          key={column.id}
          column={column}
          isSelected={colIndex === cursor.columnIndex}
          selectedCardIndex={colIndex === cursor.columnIndex ? cursor.cardIndex : -1}
        />
      ))}
    </Box>
  )
}

function KanbanColumn({
  column,
  isSelected,
  selectedCardIndex,
}: {
  column: Column
  isSelected: boolean
  selectedCardIndex: number
}) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={isSelected ? "cyan" : undefined}>
      <ColumnHeader name={column.name} count={column.cards.length} isSelected={isSelected} />
      <CardList cards={column.cards} selectedIndex={selectedCardIndex} />
    </Box>
  )
}

function ColumnHeader({ name, count, isSelected }: { name: string; count: number; isSelected: boolean }) {
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginBottom={1}>
      <Text bold color={isSelected ? "cyan" : undefined}>
        {name}
      </Text>
      <Text dimColor>({count})</Text>
    </Box>
  )
}

function CardList({ cards, selectedIndex }: { cards: Card[]; selectedIndex: number }) {
  if (cards.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor italic>
          No cards
        </Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      overflow="scroll"
      scrollTo={selectedIndex >= 0 ? selectedIndex : undefined}
      paddingX={1}
    >
      {cards.map((card, i) => (
        <CardRow key={card.id} card={card} isSelected={i === selectedIndex} />
      ))}
    </Box>
  )
}

function CardRow({ card, isSelected }: { card: Card; isSelected: boolean }) {
  return (
    <Box flexDirection="column">
      <Text backgroundColor={isSelected ? "cyan" : undefined} color={isSelected ? "black" : undefined}>
        {isSelected ? "> " : "  "}
        {card.title}
      </Text>
      {card.tags && card.tags.length > 0 && <TagRow tags={card.tags} isSelected={isSelected} />}
    </Box>
  )
}

function TagRow({ tags, isSelected }: { tags: string[]; isSelected: boolean }) {
  return (
    <Box paddingLeft={2}>
      <Text
        dimColor={!isSelected}
        backgroundColor={isSelected ? "cyan" : undefined}
        color={isSelected ? "black" : undefined}
      >
        {tags.map((tag) => `[${tag}]`).join(" ")}
      </Text>
    </Box>
  )
}

function HelpBar() {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text dimColor>h/l or arrows: switch column | j/k or arrows: navigate | m/M: move card | q: quit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Key Patterns

### Flex-based column layout

Columns share space equally via `flexGrow`. The board is a horizontal flex container; each column grows to fill its share:

```tsx
function Board({ columns, cursor }: { columns: Column[]; cursor: CursorPosition }) {
  return (
    <Box flexDirection="row" flexGrow={1}>
      {columns.map((column, colIndex) => (
        <KanbanColumn
          key={column.id}
          column={column}
          isSelected={colIndex === cursor.columnIndex}
          selectedCardIndex={colIndex === cursor.columnIndex ? cursor.cardIndex : -1}
        />
      ))}
    </Box>
  )
}
```

### Scrollable card list

Each column has its own scroll container. `scrollTo` keeps the selected card visible:

```tsx
<Box
  flexDirection="column"
  flexGrow={1}
  overflow="scroll"
  scrollTo={selectedIndex >= 0 ? selectedIndex : undefined}
  paddingX={1}
>
  {cards.map((card, i) => (
    <CardRow key={card.id} card={card} isSelected={i === selectedIndex} />
  ))}
</Box>
```

### Multi-axis keyboard navigation

Horizontal moves between columns, vertical moves within. When switching columns, the card index is clamped to the new column's bounds:

```tsx
if (input === "l" || key.rightArrow) {
  setCursor((c) => {
    const newColIndex = Math.min(c.columnIndex + 1, columns.length - 1)
    const newColCards = columns[newColIndex].cards.length
    return {
      columnIndex: newColIndex,
      cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
    }
  })
}

if (input === "j" || key.downArrow) {
  setCursor((c) => ({
    ...c,
    cardIndex: Math.min(c.cardIndex + 1, maxCardIndex),
  }))
}
```

## Key Silvery Features Used

| Feature             | Usage                                    |
| ------------------- | ---------------------------------------- |
| `overflow="scroll"` | Each column scrolls independently        |
| `scrollTo={index}`  | Keep selected card visible in its column |
| `flexGrow={1}`      | Equal-width columns                      |
| `justifyContent`    | Space header name and count apart        |
| `useInput()`        | Two-axis keyboard navigation             |
| Variable heights    | Cards with tags are taller               |

## Exercises

1. **Add card creation** - Press `a` to add a card to current column
2. **Add card editing** - Press `e` to edit the selected card's title
3. **Add drag preview** - Show where the card will go when moving
4. **Add search/filter** - Press `/` to filter cards by title or tag
5. **Add persistence** - Save board state to a JSON file
6. **Add swimlanes** - Group cards by tag within columns
