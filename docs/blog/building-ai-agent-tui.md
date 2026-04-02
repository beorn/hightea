---
title: "Building an AI Coding Agent TUI"
description: "How to build a terminal-based AI coding agent with streaming responses, tool call rendering, and scrollable output using Silvery."
date: 2026-04-02
---

# Building an AI Coding Agent TUI

AI coding agents like Claude Code, Aider, and Goose all run in the terminal. They share a common set of UI challenges: streaming text that grows unpredictably, tool call results that need structured display, conversation histories that can grow to thousands of lines, and input handling that needs to coexist with multi-line paste.

I built an AI chat interface with Silvery to see how its primitives map to these requirements. This isn't a toy demo -- it covers the patterns you'd actually need for a production agent TUI.

## The Minimal Chat

Start with the basics: a scrollable message area and a text input.

```tsx
import { Box, Text, TextInput } from "silvery"
import { run } from "silvery/runtime"
import { useState } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")

  async function send(text: string) {
    if (!text.trim()) return
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: text }])

    // Replace with your LLM call
    const reply = `Echo: ${text}`
    setMessages((prev) => [...prev, { role: "assistant", content: reply }])
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={messages.length - 1} paddingX={1}>
        {messages.map((msg, i) => (
          <Text key={i} color={msg.role === "user" ? "$primary" : "$fg"}>
            {msg.role === "user" ? "> " : "  "}
            {msg.content}
          </Text>
        ))}
      </Box>
      <Box borderStyle="round" borderColor="$muted" paddingX={1}>
        <TextInput value={input} onChange={setInput} onSubmit={send} placeholder="Ask anything..." prompt="you: " />
      </Box>
    </Box>
  )
}

await run(<Chat />)
```

The key parts:

- **`overflow="scroll"`** on the message area makes it scrollable. Silvery measures the children and renders only the visible ones.
- **`scrollTo={messages.length - 1}`** auto-scrolls to the latest message.
- **`TextInput`** gives you readline shortcuts out of the box: Ctrl+A/E for start/end, Ctrl+K to kill to end of line, Ctrl+U to kill to start, Alt+B/F for word movement, Ctrl+Y to yank.
- **`flexGrow={1}`** makes the message area fill all available height. The input box takes its natural height.

That's about 40 lines for a working chat interface with scroll handling, keyboard shortcuts, and proper layout.

## Adding Streaming

The interesting part of an AI chat is streaming. Tokens arrive one at a time, and you want to display them as they arrive. Here's the pattern:

```tsx
interface Message {
  id: number
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}

let nextId = 0

function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)

  async function send(text: string) {
    if (!text.trim() || busy) return
    setInput("")
    setBusy(true)

    const userId = nextId++
    const assistantId = nextId++

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ])

    // Simulate streaming (replace with real API call)
    const response = "This is a streamed response from the AI assistant."
    for (const char of response) {
      await new Promise((r) => setTimeout(r, 20))
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + char } : m)))
    }

    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)))
    setBusy(false)
  }

  // ... render (same as above, plus streaming indicator)
}
```

Each token update triggers a re-render of only the streaming message's text node. Silvery's incremental renderer sees that one text node changed and updates just that cell range -- about 169 microseconds per token. At 50 tokens per second, that's 8.5ms total rendering time, leaving the event loop free for everything else.

## Rendering Tool Calls

AI agents don't just chat -- they run tools. File edits, shell commands, search results. Each tool call type needs different rendering:

```tsx
interface ToolCall {
  type: "file_edit" | "shell" | "search"
  name: string
  input: Record<string, unknown>
  output?: string
  status: "running" | "done" | "error"
}

function ToolCallView({ tool }: { tool: ToolCall }) {
  const { width } = useContentRect()

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$muted" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="$accent">
          {tool.name}
        </Text>
        <ToolStatus status={tool.status} />
      </Box>

      {tool.type === "file_edit" && tool.input.path && <Text color="$muted">{String(tool.input.path)}</Text>}

      {tool.type === "shell" && tool.input.command && <Text color="$muted">$ {String(tool.input.command)}</Text>}

      {tool.output && (
        <Box overflow="scroll" maxHeight={10}>
          <Text wrap="wrap">{truncateOutput(tool.output, width - 4)}</Text>
        </Box>
      )}
    </Box>
  )
}

function ToolStatus({ status }: { status: string }) {
  if (status === "running") return <Spinner label="running" />
  if (status === "done") return <Badge variant="success">done</Badge>
  return <Badge variant="error">error</Badge>
}
```

A few things to note:

- **`useContentRect()`** lets the tool call view know its width, so it can truncate output intelligently.
- **`overflow="scroll"` with `maxHeight`** caps the output display at 10 rows. Long command outputs get a scrollable region instead of blowing up the layout.
- **`Spinner`** shows an animated indicator while a tool is running. No manual animation code needed.
- **`Badge`** renders a styled status label that automatically picks the right color from the theme.

## A Message Component with Mixed Content

Real agent conversations interleave text and tool calls. Here's a message component that handles both:

```tsx
import { Box, Text, Spinner, Badge, useContentRect } from "silvery"

type ContentBlock = { type: "text"; text: string } | { type: "tool_use"; tool: ToolCall }

interface Message {
  id: number
  role: "user" | "assistant"
  content: ContentBlock[]
  streaming?: boolean
}

function MessageView({ message }: { message: Message }) {
  return (
    <Box flexDirection="column" paddingY={message.role === "assistant" ? 0 : 0}>
      <Text bold color={message.role === "user" ? "$primary" : "$accent"}>
        {message.role === "user" ? "You" : "Assistant"}
        {message.streaming && " ..."}
      </Text>
      {message.content.map((block, i) => {
        if (block.type === "text") {
          return (
            <Text key={i} wrap="wrap">
              {block.text}
            </Text>
          )
        }
        return <ToolCallView key={i} tool={block.tool} />
      })}
    </Box>
  )
}
```

## Handling Long Conversations

For conversations with hundreds of messages, `overflow="scroll"` works up to a point. Beyond a few hundred items, you want virtualization. `VirtualList` renders only the visible items:

```tsx
import { VirtualList } from "silvery"

function ConversationView({ messages }: { messages: Message[] }) {
  const { height } = useContentRect()

  return (
    <VirtualList
      items={messages}
      height={height}
      itemHeight={(msg) => estimateHeight(msg)}
      scrollTo={messages.length - 1}
      overscan={3}
      renderItem={(msg) => <MessageView message={msg} />}
    />
  )
}

function estimateHeight(msg: Message): number {
  // Rough estimate: 2 lines for header, plus lines per content block
  let lines = 2
  for (const block of msg.content) {
    if (block.type === "text") {
      lines += Math.ceil(block.text.length / 80) || 1
    } else {
      lines += 5 // tool call box
    }
  }
  return lines
}
```

`VirtualList` handles the viewport calculation. Only visible items plus a few overscan items above and below are in the React tree. Scrolling is keyboard-driven (j/k, Page Up/Down, Home/End) when `interactive` mode is enabled.

For the most native experience, `ScrollbackView` pushes completed messages into the terminal's scrollback buffer:

```tsx
import { ScrollbackView } from "silvery"
;<ScrollbackView items={messages} keyExtractor={(m) => m.id} isFrozen={(m) => !m.streaming} footer={<InputBar />}>
  {(msg) => <MessageView message={msg} />}
</ScrollbackView>
```

Once a message is frozen (no longer streaming), it graduates to the terminal's native scrollback. The user scrolls with their terminal's native mechanism -- mouse wheel, scrollbar, Shift+PageUp. Text selection works. The content becomes part of the terminal's permanent history.

## Multi-line Input with Paste Support

AI coding agents need to handle pasted code blocks. The `usePaste` hook receives pasted text as a single event:

```tsx
import { TextArea } from "silvery"

function InputArea({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <Box borderStyle="round" borderColor="$muted" paddingX={1}>
      <TextArea
        value={value}
        onChange={setValue}
        onSubmit={() => {
          onSubmit(value)
          setValue("")
        }}
        placeholder="Type a message... (Ctrl+Enter to send)"
        height={3}
      />
    </Box>
  )
}
```

`TextArea` gives you multi-line editing with word wrap, cursor movement, undo/redo, and selection. Bracketed paste mode is handled automatically -- pasted multi-line text arrives as a single event instead of being interpreted as individual keystrokes.

## Putting It Together

The full architecture looks like this:

```
ScrollbackView (or VirtualList)
  MessageView (text + tool calls)
    Text blocks with streaming updates
    ToolCallView with status, output, scroll
  MessageView
    ...
InputBar
  TextArea (multi-line) or TextInput (single-line)
```

The framework handles scrolling, viewport management, incremental updates for streaming tokens, and text input with readline shortcuts. What's left for you is the LLM integration, the tool execution logic, and the conversation state management -- the parts that are actually specific to your agent.

## Performance Notes

The numbers that matter for an AI chat:

- **Streaming token update**: ~169us per token. At 100 tokens/second, that's 16.9ms total rendering -- well within a 60fps budget.
- **Scroll to latest message**: ~200us. Effectively instant.
- **Tool call output append**: ~180us per update. Even rapid shell output doesn't cause visible lag.

These are incremental update times. Silvery's dirty tracking means only the changed nodes re-render. For a streaming token, that's a single text node update -- not a full-tree re-render.

For comparison, a full-tree re-render on a conversation with 50 messages takes about 15ms. That's still fast enough, but the incremental path means you don't pay that cost on every keystroke or token.
