/**
 * Browser-Ready Showcase Components for inkx Live Demos
 *
 * Visual-only components rendered via renderToXterm() in xterm.js iframes
 * on the VitePress docs site. No keyboard input — animations via timers.
 */

import React, { useState, useEffect } from "react"
import { Box, Text, useContentRect } from "../../src/xterm/index.js"

// ============================================================================
// 1. DashboardShowcase
// ============================================================================

function DashboardShowcase(): JSX.Element {
  const { width } = useContentRect()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  const cpu = 32 + ((tick * 7) % 41)
  const mem = 58 + ((tick * 3) % 22)
  const disk = 67 + ((tick * 2) % 8)
  const net = (1.2 + ((tick * 0.3) % 2.5)).toFixed(1)

  const stats = [
    { label: "CPU Usage", value: `${cpu}%`, color: cpu > 60 ? "red" : "green" },
    { label: "Memory", value: `${mem}%`, color: mem > 70 ? "yellow" : "green" },
    { label: "Disk I/O", value: `${disk} MB/s`, color: "cyan" },
    { label: "Network", value: `${net} Gb/s`, color: "green" },
  ]

  const activities = [
    "Deploy v2.4.1 completed",
    "User auth service restarted",
    "Backup job finished",
    "Cache purged (12.4 GB)",
    "SSL cert renewed",
    "DB migration applied",
  ]
  const visibleActivities = activities.slice(tick % 3, (tick % 3) + 4)

  const projects = [
    { label: "Frontend", pct: Math.min(100, 72 + tick * 3) },
    { label: "Backend", pct: Math.min(100, 58 + tick * 2) },
    { label: "Testing", pct: Math.min(100, 35 + tick * 4) },
    { label: "Docs", pct: Math.min(100, 20 + tick * 5) },
  ]

  const barWidth = Math.max(8, Math.floor((width - 12) / 3) - 8)

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
        <Text bold color="magenta">
          System Dashboard
        </Text>
        <Text dim> {" "} Live Monitoring</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        {/* System Stats */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="cyan">System Stats</Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            {stats.map((s) => (
              <Box key={s.label} flexDirection="row" justifyContent="space-between">
                <Text>{s.label}</Text>
                <Text bold color={s.color}>{s.value}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Activity Log */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="yellow" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="yellow">Activity Log</Text>
          </Box>
          <Box flexDirection="column">
            {visibleActivities.map((a, i) => (
              <Text key={i} dim={i > 1}>
                {i === 0 ? <Text color="green">{">"} </Text> : "  "}
                {a}
              </Text>
            ))}
          </Box>
        </Box>

        {/* Project Progress */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="green" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="green">Progress</Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            {projects.map((p) => {
              const filled = Math.round((p.pct / 100) * barWidth)
              const empty = barWidth - filled
              return (
                <Box key={p.label} flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text>{p.label}</Text>
                    <Text bold>{Math.min(p.pct, 100)}%</Text>
                  </Box>
                  <Text>
                    <Text color="green">{"█".repeat(filled)}</Text>
                    <Text dim>{"░".repeat(Math.max(0, empty))}</Text>
                  </Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// 2. AIChatShowcase
// ============================================================================

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  done: boolean
}

const CHAT_SCRIPT = [
  { role: "user" as const, content: "How does inkx handle layout feedback?" },
  {
    role: "assistant" as const,
    content:
      "inkx uses two-phase rendering where components know their actual size during render via useContentRect(). No useEffect, no layout thrashing - dimensions are available synchronously.",
  },
  { role: "user" as const, content: "Can it run in the browser?" },
  {
    role: "assistant" as const,
    content:
      "Yes! inkx renders to xterm.js via a terminal adapter. The same React components work in both real terminals and browser-embedded terminals. This demo is running in your browser right now.",
  },
]

function AIChatShowcase(): JSX.Element {
  const { width } = useContentRect()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [charIndex, setCharIndex] = useState(0)
  const [scriptIndex, setScriptIndex] = useState(0)

  useEffect(() => {
    if (scriptIndex >= CHAT_SCRIPT.length) return

    const current = CHAT_SCRIPT[scriptIndex]!
    const isUser = current.role === "user"
    const speed = isUser ? 60 : 20

    // Add message shell on first char
    if (charIndex === 0) {
      setMessages((prev) => [...prev, { role: current.role, content: "", done: false }])
    }

    if (charIndex < current.content.length) {
      const id = setTimeout(() => {
        const nextChar = Math.min(charIndex + (isUser ? 1 : 2), current.content.length)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]!
          next[next.length - 1] = {
            ...last,
            content: current.content.slice(0, nextChar),
            done: nextChar >= current.content.length,
          }
          return next
        })
        setCharIndex(nextChar)
      }, speed)
      return () => clearTimeout(id)
    } else {
      // Pause between messages
      const id = setTimeout(() => {
        setScriptIndex((i) => i + 1)
        setCharIndex(0)
      }, 1200)
      return () => clearTimeout(id)
    }
  }, [scriptIndex, charIndex])

  const maxBubble = Math.min(60, width - 8)

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} marginBottom={1}>
        <Text bold color="magenta">
          inkx AI Chat
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        {messages.map((msg, i) => (
          <Box
            key={i}
            flexDirection="column"
            alignItems={msg.role === "user" ? "flex-end" : "flex-start"}
            paddingX={1}
          >
            <Text bold color={msg.role === "user" ? "cyan" : "green"}>
              {msg.role === "user" ? "You" : "Assistant"}
            </Text>
            <Box
              borderStyle="round"
              borderColor={msg.role === "user" ? "cyan" : "green"}
              paddingX={1}
              maxWidth={maxBubble}
            >
              <Text wrap="wrap">
                {msg.content}
                {!msg.done && (
                  <Text color="yellow" bold>
                    {" "}
                    _
                  </Text>
                )}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text dim italic>
          Type a message...
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 3. KanbanShowcase
// ============================================================================

interface KanbanCard {
  title: string
  tags: { name: string; color: string }[]
}

interface KanbanColumn {
  title: string
  color: string
  cards: KanbanCard[]
}

const KANBAN_DATA: KanbanColumn[] = [
  {
    title: "To Do",
    color: "red",
    cards: [
      { title: "Design new landing page", tags: [{ name: "design", color: "yellow" }] },
      { title: "Write API documentation", tags: [{ name: "docs", color: "blue" }] },
      { title: "Set up monitoring", tags: [{ name: "devops", color: "green" }] },
      { title: "Add dark mode", tags: [{ name: "frontend", color: "cyan" }, { name: "ux", color: "white" }] },
    ],
  },
  {
    title: "In Progress",
    color: "yellow",
    cards: [
      {
        title: "User authentication",
        tags: [{ name: "backend", color: "magenta" }, { name: "security", color: "red" }],
      },
      { title: "Dashboard redesign", tags: [{ name: "frontend", color: "cyan" }] },
      { title: "API rate limiting", tags: [{ name: "backend", color: "magenta" }] },
    ],
  },
  {
    title: "Done",
    color: "green",
    cards: [
      { title: "Project setup", tags: [{ name: "devops", color: "green" }] },
      { title: "CI/CD pipeline", tags: [{ name: "devops", color: "green" }] },
      { title: "Initial wireframes", tags: [{ name: "design", color: "yellow" }] },
    ],
  },
]

function KanbanShowcase(): JSX.Element {
  const [selectedCol, setSelectedCol] = useState(1)
  const [selectedCard, setSelectedCard] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setSelectedCard((c) => {
        const colCards = KANBAN_DATA[selectedCol]?.cards ?? []
        if (c + 1 >= colCards.length) {
          setSelectedCol((col) => (col + 1) % 3)
          return 0
        }
        return c + 1
      })
    }, 2500)
    return () => clearInterval(id)
  }, [selectedCol])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          Kanban Board
        </Text>
        <Text dim> {" "} 10 cards across 3 columns</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        {KANBAN_DATA.map((col, colIdx) => (
          <Box
            key={col.title}
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor={colIdx === selectedCol ? "cyan" : "gray"}
          >
            <Box
              backgroundColor={colIdx === selectedCol ? "cyan" : undefined}
              paddingX={1}
            >
              <Text bold color={colIdx === selectedCol ? "black" : col.color}>
                {col.title}
              </Text>
              <Text color={colIdx === selectedCol ? "black" : "gray"}> ({col.cards.length})</Text>
            </Box>

            <Box flexDirection="column" paddingX={1} gap={1} marginTop={1}>
              {col.cards.map((card, cardIdx) => {
                const isSelected = colIdx === selectedCol && cardIdx === selectedCard
                return (
                  <Box
                    key={card.title}
                    flexDirection="column"
                    borderStyle="round"
                    borderColor={isSelected ? "cyan" : "gray"}
                    paddingX={1}
                  >
                    {isSelected ? (
                      <Text backgroundColor="cyan" color="black" bold>
                        {card.title}
                      </Text>
                    ) : (
                      <Text>{card.title}</Text>
                    )}
                    <Box flexDirection="row" gap={1}>
                      {card.tags.map((tag) => (
                        <Text key={tag.name} color={tag.color} dim>
                          #{tag.name}
                        </Text>
                      ))}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// 4. CLIWizardShowcase
// ============================================================================

interface WizardStep {
  label: string
  status: "done" | "active" | "pending"
}

function CLIWizardShowcase(): JSX.Element {
  const [activeField, setActiveField] = useState(0)

  const steps: WizardStep[] = [
    { label: "Project Info", status: "done" },
    { label: "Configuration", status: "active" },
    { label: "Dependencies", status: "pending" },
    { label: "Review", status: "pending" },
  ]

  const fields = [
    { label: "Framework", value: "React + TypeScript" },
    { label: "Bundler", value: "Vite" },
    { label: "Test Runner", value: "Vitest" },
    { label: "Linter", value: "Biome" },
    { label: "CSS", value: "Tailwind CSS" },
  ]

  useEffect(() => {
    const id = setInterval(() => {
      setActiveField((f) => (f + 1) % fields.length)
    }, 2000)
    return () => clearInterval(id)
  }, [fields.length])

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} marginBottom={1}>
        <Text bold color="magenta">
          Project Setup Wizard
        </Text>
      </Box>

      {/* Step indicator */}
      <Box flexDirection="row" marginBottom={1} gap={1} paddingX={1}>
        {steps.map((step, i) => {
          const icon = step.status === "done" ? "\u2713" : step.status === "active" ? "\u25CF" : "\u25CB"
          const color = step.status === "done" ? "green" : step.status === "active" ? "cyan" : "gray"
          const connector = i < steps.length - 1 ? " \u2500\u2500 " : ""
          return (
            <React.Fragment key={step.label}>
              <Box>
                <Text color={color} bold={step.status === "active"}>
                  {icon} {step.label}
                </Text>
              </Box>
              {connector && <Text dim>{connector}</Text>}
            </React.Fragment>
          )
        })}
      </Box>

      {/* Active step form */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        padding={1}
        flexGrow={1}
      >
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Step 2: Configuration
          </Text>
          <Text dim> {" "} Select your stack preferences</Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          {fields.map((field, i) => {
            const isActive = i === activeField
            return (
              <Box key={field.label} flexDirection="row" gap={1}>
                <Text color={isActive ? "cyan" : "gray"}>
                  {isActive ? "\u25B6" : " "}
                </Text>
                <Box width={14}>
                  <Text bold={isActive} color={isActive ? "white" : "gray"}>
                    {field.label}
                  </Text>
                </Box>
                <Box
                  borderStyle="round"
                  borderColor={isActive ? "cyan" : "gray"}
                  paddingX={1}
                  flexGrow={1}
                >
                  <Text color={isActive ? "white" : "gray"}>
                    {field.value}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      <Box flexDirection="row" paddingX={1} marginTop={1} justifyContent="space-between">
        <Text dim>
          <Text color="gray">[Esc]</Text> Back
        </Text>
        <Text dim>
          <Text color="cyan">[Enter]</Text> Confirm {" "}
          <Text color="gray">[Tab]</Text> Next Field
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 5. DevToolsShowcase
// ============================================================================

interface LogEntry {
  time: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  message: string
}

const ALL_LOGS: LogEntry[] = [
  { time: "14:23:01", level: "INFO", message: "Server started on port 3000" },
  { time: "14:23:02", level: "INFO", message: "Database connection established" },
  { time: "14:23:05", level: "DEBUG", message: "Loading configuration from env" },
  { time: "14:23:08", level: "WARN", message: "Cache miss ratio above threshold (42%)" },
  { time: "14:23:12", level: "ERROR", message: "Failed to connect to Redis: ECONNREFUSED" },
  { time: "14:23:15", level: "INFO", message: "Retry succeeded: Redis connected" },
  { time: "14:23:18", level: "INFO", message: "Worker pool initialized (4 threads)" },
  { time: "14:23:22", level: "WARN", message: "Deprecated API v1 endpoint called: /api/v1/users" },
  { time: "14:23:25", level: "DEBUG", message: "GC pause: 12ms (minor collection)" },
  { time: "14:23:30", level: "ERROR", message: "Timeout: /api/analytics took 5200ms" },
  { time: "14:23:33", level: "INFO", message: "Health check: all services green" },
  { time: "14:23:38", level: "INFO", message: "Request processed: 200 OK (23ms)" },
]

const SEARCH_QUERIES = ["", "error", "redis", "api", "warn", ""]

function DevToolsShowcase(): JSX.Element {
  const [searchIdx, setSearchIdx] = useState(0)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setSearchIdx((i) => (i + 1) % SEARCH_QUERIES.length)
      setCursor(0)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // Animate typing the search query
  const targetQuery = SEARCH_QUERIES[searchIdx]!
  const [displayQuery, setDisplayQuery] = useState("")

  useEffect(() => {
    if (targetQuery === "") {
      setDisplayQuery("")
      return
    }
    let charIdx = 0
    const id = setInterval(() => {
      charIdx++
      if (charIdx > targetQuery.length) {
        clearInterval(id)
        return
      }
      setDisplayQuery(targetQuery.slice(0, charIdx))
    }, 100)
    return () => clearInterval(id)
  }, [targetQuery])

  const query = displayQuery.toLowerCase()
  const filtered = query
    ? ALL_LOGS.filter(
        (l) =>
          l.message.toLowerCase().includes(query) ||
          l.level.toLowerCase().includes(query),
      )
    : ALL_LOGS

  const levelColor = (level: string): string => {
    switch (level) {
      case "INFO": return "green"
      case "WARN": return "yellow"
      case "ERROR": return "red"
      case "DEBUG": return "gray"
      default: return "white"
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Text bold color="magenta">
          Log Viewer
        </Text>
        <Text dim> {" "} {filtered.length} of {ALL_LOGS.length} entries</Text>
      </Box>

      {/* Search box */}
      <Box flexDirection="row" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Search:{" "}
        </Text>
        <Text>{displayQuery}</Text>
        <Text color="cyan" bold>|</Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {filtered.slice(0, 10).map((log, i) => (
          <Box key={i} flexDirection="row" gap={1}>
            <Text dim>{log.time}</Text>
            <Box width={7}>
              <Text bold color={levelColor(log.level)}>
                {log.level.padEnd(5)}
              </Text>
            </Box>
            <Text>{log.message}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// 6. DataExplorerShowcase
// ============================================================================

interface ProcessRow {
  id: string
  name: string
  status: "running" | "stopped" | "idle"
  cpu: number
  mem: string
}

const PROCESS_DATA: ProcessRow[] = [
  { id: "PID-1024", name: "web-server", status: "running", cpu: 45, mem: "128 MB" },
  { id: "PID-1025", name: "db-primary", status: "running", cpu: 72, mem: "512 MB" },
  { id: "PID-1026", name: "cache-redis", status: "running", cpu: 12, mem: "256 MB" },
  { id: "PID-1027", name: "worker-pool", status: "running", cpu: 38, mem: "96 MB" },
  { id: "PID-1028", name: "log-shipper", status: "idle", cpu: 2, mem: "32 MB" },
  { id: "PID-1029", name: "cron-scheduler", status: "idle", cpu: 0, mem: "16 MB" },
  { id: "PID-1030", name: "backup-agent", status: "stopped", cpu: 0, mem: "0 MB" },
  { id: "PID-1031", name: "metrics-collector", status: "running", cpu: 18, mem: "64 MB" },
  { id: "PID-1032", name: "api-gateway", status: "running", cpu: 55, mem: "192 MB" },
  { id: "PID-1033", name: "mail-service", status: "stopped", cpu: 0, mem: "0 MB" },
]

function DataExplorerShowcase(): JSX.Element {
  const { width } = useContentRect()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  // Jitter CPU values to simulate live updates
  const rows = PROCESS_DATA.map((row) => ({
    ...row,
    cpu:
      row.status === "running"
        ? Math.max(1, Math.min(99, row.cpu + ((tick * 7 + row.cpu) % 15) - 7))
        : row.cpu,
  }))

  const statusColor = (s: string): string => {
    switch (s) {
      case "running": return "green"
      case "stopped": return "red"
      case "idle": return "yellow"
      default: return "white"
    }
  }

  const colW = {
    id: 10,
    name: Math.max(18, Math.floor((width - 46) / 2)),
    status: 10,
    cpu: 6,
    mem: 9,
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Box flexDirection="row">
          <Text bold color="magenta">
            Process Explorer
          </Text>
          <Text dim> {" "} {rows.length} processes</Text>
        </Box>
        <Text dim>
          Sorted by <Text bold color="cyan">CPU% \u25BC</Text>
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
      >
        {/* Header */}
        <Box flexDirection="row" backgroundColor="gray">
          <Box width={colW.id} paddingX={1}>
            <Text bold color="black">ID</Text>
          </Box>
          <Box width={colW.name} paddingX={1}>
            <Text bold color="black">Name</Text>
          </Box>
          <Box width={colW.status} paddingX={1}>
            <Text bold color="black">Status</Text>
          </Box>
          <Box width={colW.cpu} paddingX={1}>
            <Text bold color="black">CPU%</Text>
          </Box>
          <Box width={colW.mem} paddingX={1}>
            <Text bold color="black">Mem</Text>
          </Box>
        </Box>

        {/* Rows sorted by CPU descending */}
        {[...rows]
          .sort((a, b) => b.cpu - a.cpu)
          .map((row, i) => (
            <Box key={row.id} flexDirection="row" backgroundColor={i % 2 === 0 ? undefined : "#1e1e3e"}>
              <Box width={colW.id} paddingX={1}>
                <Text dim>{row.id}</Text>
              </Box>
              <Box width={colW.name} paddingX={1}>
                <Text>{row.name}</Text>
              </Box>
              <Box width={colW.status} paddingX={1}>
                <Text color={statusColor(row.status)}>{row.status}</Text>
              </Box>
              <Box width={colW.cpu} paddingX={1}>
                <Text bold color={row.cpu > 50 ? "red" : row.cpu > 20 ? "yellow" : "green"}>
                  {String(row.cpu).padStart(2)}
                </Text>
              </Box>
              <Box width={colW.mem} paddingX={1}>
                <Text>{row.mem}</Text>
              </Box>
            </Box>
          ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Exports
// ============================================================================

export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: DashboardShowcase,
  "ai-chat": AIChatShowcase,
  kanban: KanbanShowcase,
  "cli-wizard": CLIWizardShowcase,
  "dev-tools": DevToolsShowcase,
  "data-explorer": DataExplorerShowcase,
}
