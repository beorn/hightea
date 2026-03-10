---
prev:
  text: Dashboard
  link: /examples/dashboard
next:
  text: Kanban Board
  link: /examples/kanban
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Task List Example

A scrollable task list with variable-height items and keyboard navigation.

[[toc]]

## Live Demo

<LiveDemo xtermSrc="/examples/showcase.html?demo=scroll" :height="400" />

## What It Demonstrates

- **Automatic scrolling** with `overflow="scroll"` and `scrollTo`
- **Variable-height items** — tasks with subtasks render taller
- **Flex layout** — content fills available space, text truncates naturally
- **Keyboard navigation** with `useInput()`
- **Selection styling** with inverse colors

## Screenshot

```
  Tasks (7 items)
+------------------------------------------+
| [ ] Research Silvery documentation          |
|     - Read the API docs                  |
|     - Try the examples                   |
| [x] Install dependencies                 |
|>[x] Set up project structure             |
|     - Create src/ directory              |
|     - Add tsconfig.json                  |
| [ ] Write the migration guide            |
+------------------------------------------+
  v 3 more
```

## Running the Example

```bash
cd silvery
bun run examples/task-list/app.tsx
```

## Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useInput, useApp, createTerm } from "silvery"
import { useState } from "react"

interface Subtask {
  id: string
  title: string
  done: boolean
}

interface Task {
  id: string
  title: string
  done: boolean
  subtasks?: Subtask[]
}

const initialTasks: Task[] = [
  {
    id: "1",
    title: "Research Silvery documentation",
    done: false,
    subtasks: [
      { id: "1a", title: "Read the API docs", done: true },
      { id: "1b", title: "Try the examples", done: false },
    ],
  },
  {
    id: "2",
    title: "Install dependencies",
    done: true,
  },
  {
    id: "3",
    title: "Set up project structure",
    done: true,
    subtasks: [
      { id: "3a", title: "Create src/ directory", done: true },
      { id: "3b", title: "Add tsconfig.json", done: true },
    ],
  },
  {
    id: "4",
    title: "Write the migration guide",
    done: false,
    subtasks: [
      { id: "4a", title: "Document breaking changes", done: false },
      { id: "4b", title: "Add code examples", done: false },
      { id: "4c", title: "Review with team", done: false },
    ],
  },
  {
    id: "5",
    title: "Update README",
    done: false,
  },
  {
    id: "6",
    title: "Add CI/CD pipeline",
    done: false,
    subtasks: [
      { id: "6a", title: "Set up GitHub Actions", done: false },
      { id: "6b", title: "Add test workflow", done: false },
    ],
  },
  {
    id: "7",
    title: "Release v1.0",
    done: false,
  },
]

function App() {
  const { exit } = useApp()
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit()
    }

    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, tasks.length - 1))
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }

    if (input === " " || key.return) {
      setTasks((prev) => prev.map((task, i) => (i === selectedIndex ? { ...task, done: !task.done } : task)))
    }
  })

  const completedCount = tasks.filter((t) => t.done).length

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header total={tasks.length} completed={completedCount} />
      <TaskList tasks={tasks} selectedIndex={selectedIndex} />
      <HelpBar />
    </Box>
  )
}

function Header({ total, completed }: { total: number; completed: number }) {
  return (
    <Box paddingX={1} marginBottom={1} gap={1}>
      <Text bold>Tasks</Text>
      <Text>
        ({completed}/{total} done)
      </Text>
    </Box>
  )
}

function TaskList({ tasks, selectedIndex }: { tasks: Task[]; selectedIndex: number }) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" overflow="scroll" scrollTo={selectedIndex}>
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} />
      ))}
    </Box>
  )
}

function TaskRow({ task, isSelected }: { task: Task; isSelected: boolean }) {
  const checkbox = task.done ? "[x]" : "[ ]"
  const prefix = isSelected ? ">" : " "

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text backgroundColor={isSelected ? "cyan" : undefined} color={isSelected ? "black" : undefined}>
          {prefix} {checkbox} {task.title}
        </Text>
      </Box>
      {task.subtasks?.map((subtask) => (
        <SubtaskRow key={subtask.id} subtask={subtask} isParentSelected={isSelected} />
      ))}
    </Box>
  )
}

function SubtaskRow({ subtask, isParentSelected }: { subtask: Subtask; isParentSelected: boolean }) {
  const checkbox = subtask.done ? "x" : " "

  return (
    <Text
      dimColor={!isParentSelected}
      backgroundColor={isParentSelected ? "cyan" : undefined}
      color={isParentSelected ? "black" : undefined}
    >
      {"    "}- [{checkbox}] {subtask.title}
    </Text>
  )
}

function HelpBar() {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text dimColor>Up/Down: navigate | Space/Enter: toggle | q: quit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Key Patterns

### Scrollable Container with Auto-Follow

The `overflow="scroll"` + `scrollTo` combo handles all scrolling automatically — Silvery measures each item's actual height and keeps the selected item visible:

```tsx
<Box flexDirection="column" flexGrow={1} borderStyle="single" overflow="scroll" scrollTo={selectedIndex}>
  {tasks.map((task, i) => (
    <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} />
  ))}
</Box>
```

### Spacing with `gap`

Use `gap` on Box instead of manual `{" "}` spacers:

```tsx
<Box paddingX={1} marginBottom={1} gap={1}>
  <Text bold>Tasks</Text>
  <Text>
    ({completed}/{total} done)
  </Text>
</Box>
```

### Selection Styling Across Parent and Children

Selected state flows from task to subtasks, highlighting the entire group:

```tsx
<Text backgroundColor={isSelected ? "cyan" : undefined} color={isSelected ? "black" : undefined}>
  {prefix} {checkbox} {task.title}
</Text>
```

## Key Silvery Features Used

| Feature             | Usage                                  |
| ------------------- | -------------------------------------- |
| `overflow="scroll"` | Scrollable task list                   |
| `scrollTo={index}`  | Keep selection visible as you navigate |
| `flexGrow={1}`      | List fills available vertical space    |
| `gap={1}`           | Spacing between inline elements        |
| `useInput()`        | Arrow key navigation and task toggling |
| Variable heights    | Tasks with subtasks naturally expand   |

## How Scrolling Works

Silvery handles variable-height scrolling automatically:

1. **Yoga measures all items** - Each task (with its subtasks) gets measured
2. **Calculate visible range** - Based on `scrollTo` and container height
3. **Render visible items** - Only visible tasks get their content rendered
4. **Show overflow indicators** - "^ N more" / "v N more" appear automatically

You don't need to:

- Estimate item heights
- Manually track scroll position
- Implement virtualization
- Handle edge cases

## Exercises

1. **Add task creation** - Press `a` to add a new task
2. **Add subtask navigation** - Use Tab to move into subtasks
3. **Add filtering** - Press `f` to filter by status (all/done/pending)
4. **Add persistence** - Save tasks to a JSON file
5. **Add drag-and-drop** - Reorder tasks with shift+arrow keys
