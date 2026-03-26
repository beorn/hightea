/**
 * Dashboard Example
 *
 * A btop-style responsive dashboard demonstrating:
 * - Tab navigation with compound Tabs component
 * - Live-updating metrics with sparklines
 * - Responsive 2-column / 1-column layout via useContentRect()
 * - Semantic theme colors with severity-based color coding
 * - Flex-based progress bars
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  H2,
  Strong,
  Small,
  Muted,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  ProgressBar,
  useContentRect,
  useInput,
  useApp,
  useInterval,
  createTerm,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dashboard",
  description: "Responsive multi-pane dashboard with live metrics and charts",
  demo: true,
  features: ["Box flexGrow", "useContentRect()", "responsive", "live data", "sparklines"],
}

// ============================================================================
// Sparkline
// ============================================================================

const SPARK_CHARS = "▁▂▃▄▅▆▇█"

function sparkline(values: number[], max: number): string {
  return values.map((v) => SPARK_CHARS[Math.round((v / max) * 7)] ?? SPARK_CHARS[0]).join("")
}

/** Multi-row chart using block characters — creates a mini area chart */
function multiRowChart(values: number[], max: number, rows: number, width: number): string[] {
  // Resample values to fit width
  const resampled: number[] = []
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * values.length)
    resampled.push(values[Math.min(idx, values.length - 1)] ?? 0)
  }

  const lines: string[] = []
  for (let row = rows - 1; row >= 0; row--) {
    const threshold = (row / rows) * max
    let line = ""
    for (const val of resampled) {
      if (val >= threshold + max / rows) line += "█"
      else if (val >= threshold + (max / rows) * 0.5) line += "▄"
      else if (val >= threshold) line += "▁"
      else line += " "
    }
    lines.push(line)
  }
  return lines
}

// ============================================================================
// Data Helpers
// ============================================================================

function jitter(base: number, range: number): number {
  return Math.max(0, Math.min(100, base + (Math.random() - 0.5) * range))
}

function initHistory(base: number, range: number, len: number): number[] {
  return Array.from({ length: len }, () => jitter(base, range))
}

function pushHistory(history: number[], value: number): number[] {
  const next = [...history]
  if (next.length >= 20) next.shift()
  next.push(value)
  return next
}

function severityColor(pct: number): string {
  if (pct > 80) return "$error"
  if (pct > 60) return "$warning"
  return "$success"
}

// ============================================================================
// State
// ============================================================================

interface CoreMetrics {
  usage: number
  history: number[]
}

interface MemoryMetrics {
  used: number
  cached: number
  buffers: number
  free: number
  swap: number
  swapTotal: number
  history: number[]
}

interface NetworkMetrics {
  downloadRate: number
  uploadRate: number
  downloadHistory: number[]
  uploadHistory: number[]
  connections: number
  packetsIn: number
  packetsOut: number
}

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  mem: number
  status: string
}

function createInitialState() {
  // Varied usage to showcase severity colors (green/yellow/red)
  const coreUsages = [35, 52, 88, 45, 72, 93, 28, 61]
  const cores: CoreMetrics[] = coreUsages.map((usage, i) => ({
    usage,
    history: initHistory(usage, 15, 20),
  }))

  const memory: MemoryMetrics = {
    used: 8.2,
    cached: 3.1,
    buffers: 1.4,
    free: 3.3,
    swap: 0.8,
    swapTotal: 4.0,
    history: initHistory(55, 10, 20),
  }

  const network: NetworkMetrics = {
    downloadRate: 42.5,
    uploadRate: 12.3,
    downloadHistory: initHistory(40, 30, 20),
    uploadHistory: initHistory(12, 10, 20),
    connections: 147,
    packetsIn: 1842,
    packetsOut: 923,
  }

  const processes: ProcessInfo[] = [
    { pid: 1201, name: "node", cpu: 24.3, mem: 4.2, status: "running" },
    { pid: 892, name: "chrome", cpu: 18.7, mem: 12.1, status: "running" },
    { pid: 3456, name: "vscode", cpu: 12.1, mem: 8.4, status: "running" },
    { pid: 2103, name: "postgres", cpu: 8.9, mem: 3.7, status: "sleeping" },
    { pid: 4521, name: "docker", cpu: 6.2, mem: 5.1, status: "running" },
    { pid: 1893, name: "nginx", cpu: 3.4, mem: 1.2, status: "sleeping" },
    { pid: 7234, name: "redis", cpu: 2.1, mem: 0.8, status: "sleeping" },
    { pid: 5612, name: "bun", cpu: 1.8, mem: 2.3, status: "running" },
    { pid: 3891, name: "webpack", cpu: 1.5, mem: 1.9, status: "running" },
    { pid: 6742, name: "eslint", cpu: 0.9, mem: 0.6, status: "sleeping" },
    { pid: 8123, name: "ssh-agent", cpu: 0.3, mem: 0.1, status: "sleeping" },
    { pid: 9001, name: "cron", cpu: 0.1, mem: 0.2, status: "sleeping" },
  ]

  return { cores, memory, network, processes }
}

function tickState(prev: ReturnType<typeof createInitialState>) {
  const cores = prev.cores.map((core) => {
    const usage = jitter(core.usage, 15)
    return { usage, history: pushHistory(core.history, usage) }
  })

  const totalMem = prev.memory.used + prev.memory.cached + prev.memory.buffers + prev.memory.free
  const usedJitter = (jitter((prev.memory.used / totalMem) * 100, 3) / 100) * totalMem
  const memory: MemoryMetrics = {
    ...prev.memory,
    used: Math.max(4, usedJitter),
    swap: (jitter((prev.memory.swap / prev.memory.swapTotal) * 100, 5) / 100) * prev.memory.swapTotal,
    history: pushHistory(prev.memory.history, (usedJitter / totalMem) * 100),
  }

  const downloadRate = jitter(prev.network.downloadRate, 20)
  const uploadRate = jitter(prev.network.uploadRate, 8)
  const network: NetworkMetrics = {
    downloadRate,
    uploadRate,
    downloadHistory: pushHistory(prev.network.downloadHistory, downloadRate),
    uploadHistory: pushHistory(prev.network.uploadHistory, uploadRate),
    connections: Math.max(50, Math.round(jitter(prev.network.connections, 20))),
    packetsIn: Math.max(100, Math.round(jitter(prev.network.packetsIn, 200))),
    packetsOut: Math.max(50, Math.round(jitter(prev.network.packetsOut, 100))),
  }

  const processes = prev.processes.map((p) => ({
    ...p,
    cpu: Math.max(0.1, jitter(p.cpu, 4)),
    mem: Math.max(0.1, jitter(p.mem, 1)),
  }))

  return { cores, memory, network, processes }
}

// ============================================================================
// Components
// ============================================================================

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <H2>{children}</H2>
}

function LabelValue({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box gap={1}>
      <Muted>{label}</Muted>
      <Text color={color}>{value}</Text>
    </Box>
  )
}

// --- CPU Tab ---

function CpuCore({ index, core }: { index: number; core: CoreMetrics }) {
  const pct = Math.round(core.usage)
  const color = severityColor(pct)
  return (
    <Box>
      <Muted>{`${index} `}</Muted>
      <Box flexGrow={1}>
        <ProgressBar value={pct / 100} color={color} showPercentage />
      </Box>
    </Box>
  )
}

function CpuPane({ cores }: { cores: CoreMetrics[] }) {
  const { width: paneWidth } = useContentRect()
  const avgCpu = cores.reduce((sum, c) => sum + c.usage, 0) / cores.length
  const maxCpu = Math.max(...cores.map((c) => c.usage))
  const load1 = ((avgCpu / 100) * 8 * 0.8 + Math.random() * 0.5).toFixed(2)
  const load5 = ((avgCpu / 100) * 8 * 0.7 + Math.random() * 0.3).toFixed(2)
  const load15 = ((avgCpu / 100) * 8 * 0.6 + Math.random() * 0.2).toFixed(2)
  const avgHistory =
    cores[0]?.history.map((_, i) => cores.reduce((s, c) => s + (c.history[i] ?? 0), 0) / cores.length) ?? []
  const chartWidth = Math.max(20, paneWidth > 0 ? paneWidth : 50)
  const chartLines = multiRowChart(avgHistory, 100, 4, chartWidth)

  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box gap={2} wrap="truncate">
        <SectionHeader>CPU</SectionHeader>
        <LabelValue label="Avg:" value={`${Math.round(avgCpu)}%`} color={severityColor(avgCpu)} />
        <LabelValue label="Max:" value={`${Math.round(maxCpu)}%`} color={severityColor(maxCpu)} />
        <LabelValue label="Load:" value={`${load1} ${load5} ${load15}`} />
      </Box>
      <Box flexDirection="column">
        {cores.map((core, i) => (
          <CpuCore key={i} index={i} core={core} />
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Muted>CPU Usage History</Muted>
        {chartLines.map((line, i) => (
          <Text key={i} color="$primary">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

// --- Memory Tab ---

function MemoryPane({ memory }: { memory: MemoryMetrics }) {
  const { width: paneWidth } = useContentRect()
  const total = memory.used + memory.cached + memory.buffers + memory.free
  const usedPct = (memory.used / total) * 100
  const swapPct = memory.swap / memory.swapTotal
  const chartWidth = Math.max(20, paneWidth > 0 ? paneWidth : 50)
  const chartLines = multiRowChart(memory.history, 100, 4, chartWidth)

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      <SectionHeader>Memory</SectionHeader>
      <Box gap={2} wrap="truncate">
        <LabelValue label="Total:" value={`${total.toFixed(1)} GB`} />
        <LabelValue label="Used:" value={`${memory.used.toFixed(1)} GB`} color={severityColor(usedPct)} />
      </Box>
      <Box flexDirection="column">
        <Box gap={2} wrap="truncate">
          <Text color={severityColor(usedPct)}>
            {"█"} Used {memory.used.toFixed(1)}G
          </Text>
          <Text color="$info">
            {"█"} Cache {memory.cached.toFixed(1)}G
          </Text>
          <Text color="$primary">
            {"█"} Buf {memory.buffers.toFixed(1)}G
          </Text>
          <Muted>
            {"░"} Free {memory.free.toFixed(1)}G
          </Muted>
        </Box>
        <ProgressBar value={usedPct / 100} color={severityColor(usedPct)} showPercentage />
      </Box>
      <Box flexDirection="column">
        <Muted>
          Swap: {memory.swap.toFixed(1)}G / {memory.swapTotal.toFixed(1)}G
        </Muted>
        <ProgressBar value={swapPct} color={severityColor(swapPct * 100)} showPercentage />
      </Box>
      <Box flexDirection="column">
        <Box gap={2} wrap="truncate">
          <Muted>Top:</Muted>
          <Text>
            chrome <Strong color="$warning">12.1G</Strong>
          </Text>
          <Text>
            vscode <Strong color="$primary">8.4G</Strong>
          </Text>
          <Text>
            docker <Strong color="$primary">5.1G</Strong>
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Muted>Memory Usage History</Muted>
        {chartLines.map((line, i) => (
          <Text key={i} color="$success">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

// --- Network Tab ---

function NetworkPane({ network }: { network: NetworkMetrics }) {
  const { width: paneWidth } = useContentRect()
  const chartWidth = Math.max(20, paneWidth > 0 ? paneWidth : 50)
  const dlChart = multiRowChart(network.downloadHistory, 100, 3, chartWidth)
  const ulChart = multiRowChart(network.uploadHistory, 40, 3, chartWidth)

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      <SectionHeader>Network</SectionHeader>
      <Box flexDirection="column">
        <Box justifyContent="space-between" wrap="truncate">
          <Text color="$success">{"↓"} Download</Text>
          <Text color="$success">{network.downloadRate.toFixed(1).padStart(6)} MB/s</Text>
        </Box>
        <ProgressBar value={Math.min(1, network.downloadRate / 100)} color="$success" showPercentage={false} />
      </Box>
      <Box flexDirection="column">
        <Box justifyContent="space-between" wrap="truncate">
          <Text color="$info">{"↑"} Upload</Text>
          <Text color="$info">{network.uploadRate.toFixed(1).padStart(6)} MB/s</Text>
        </Box>
        <ProgressBar value={Math.min(1, network.uploadRate / 40)} color="$info" showPercentage={false} />
      </Box>
      <Box flexDirection="column">
        <Muted>Connections</Muted>
        <Box gap={2} wrap="truncate">
          <LabelValue label="Active:" value={String(network.connections).padStart(4)} />
          <LabelValue label="In:" value={`${String(network.packetsIn).padStart(5)} pkts`} />
          <LabelValue label="Out:" value={`${String(network.packetsOut).padStart(5)} pkts`} />
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Muted>Traffic History</Muted>
        {dlChart.map((line, i) => (
          <Text key={`dl-${i}`} color="$success">
            {line}
          </Text>
        ))}
        {ulChart.map((line, i) => (
          <Text key={`ul-${i}`} color="$info">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

// --- Processes Tab ---

// Column widths for consistent alignment
const COL = { pid: 6, name: 11, cpu: 7, mem: 7, status: 9 }

function ProcessRow({ proc, isTop }: { proc: ProcessInfo; isTop: boolean }) {
  const cpuColor = severityColor(proc.cpu)
  return (
    <Box wrap="truncate">
      <Text color="$muted">{String(proc.pid).padStart(COL.pid)}</Text>
      <Text bold={isTop}>{(" " + proc.name).padEnd(COL.name)}</Text>
      <Text color={cpuColor}>{(proc.cpu.toFixed(1) + "%").padStart(COL.cpu)}</Text>
      <Text>{(proc.mem.toFixed(1) + "%").padStart(COL.mem)}</Text>
      <Text color={proc.status === "running" ? "$success" : "$muted"}>
        {(" " + proc.status).padEnd(COL.status)}
      </Text>
    </Box>
  )
}

function ProcessPane({ processes }: { processes: ProcessInfo[] }) {
  const sorted = [...processes].sort((a, b) => b.cpu - a.cpu)

  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <SectionHeader>Processes</SectionHeader>
      <Box flexDirection="column" flexGrow={1}>
        <Box wrap="truncate">
          <Muted>
            {"PID".padStart(COL.pid)}
            {" Name".padEnd(COL.name)}
            {"CPU%".padStart(COL.cpu)}
            {"MEM%".padStart(COL.mem)}
            {" Status".padEnd(COL.status)}
          </Muted>
        </Box>
        <Box wrap="truncate">
          <Muted>{"─".repeat(COL.pid + COL.name + COL.cpu + COL.mem + COL.status)}</Muted>
        </Box>
        {sorted.map((proc, i) => (
          <ProcessRow key={proc.pid} proc={proc} isTop={i === 0} />
        ))}
      </Box>
      <Box gap={2} wrap="truncate">
        <LabelValue label="Total:" value={`${processes.length} processes`} />
        <LabelValue
          label="Running:"
          value={String(processes.filter((p) => p.status === "running").length)}
          color="$success"
        />
        <LabelValue
          label="Sleeping:"
          value={String(processes.filter((p) => p.status === "sleeping").length)}
          color="$muted"
        />
      </Box>
    </Box>
  )
}

// --- Responsive Layout ---

function WideLayout({
  cores,
  memory,
  network,
  processes,
}: {
  cores: CoreMetrics[]
  memory: MemoryMetrics
  network: NetworkMetrics
  processes: ProcessInfo[]
}) {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box
          flexGrow={1}
          flexBasis={0}
          borderStyle="round"
          borderColor="$border"
          paddingX={1}
          paddingY={1}
          flexDirection="column"
        >
          <CpuPane cores={cores} />
        </Box>
        <Box
          flexGrow={1}
          flexBasis={0}
          borderStyle="round"
          borderColor="$border"
          paddingX={1}
          paddingY={1}
          flexDirection="column"
        >
          <MemoryPane memory={memory} />
        </Box>
      </Box>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box
          flexGrow={1}
          flexBasis={0}
          borderStyle="round"
          borderColor="$border"
          paddingX={1}
          paddingY={1}
          flexDirection="column"
        >
          <NetworkPane network={network} />
        </Box>
        <Box
          flexGrow={1}
          flexBasis={0}
          borderStyle="round"
          borderColor="$border"
          paddingX={1}
          paddingY={1}
          flexDirection="column"
        >
          <ProcessPane processes={processes} />
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Dashboard
// ============================================================================

export function Dashboard() {
  const { exit } = useApp()
  const { width } = useContentRect()
  const [state, setState] = useState(createInitialState)
  // Default to wide layout — useContentRect() returns 0 in xterm.js web rendering,
  // so we only use narrow layout when we know the terminal is genuinely narrow
  const isNarrow = width > 0 && width < 100

  useInterval(() => {
    setState((prev) => tickState(prev))
  }, 500)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  if (isNarrow) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Tabs defaultValue="cpu">
          <Box justifyContent="space-between" paddingX={1}>
            <TabList>
              <Tab value="cpu">CPU</Tab>
              <Tab value="memory">Memory</Tab>
              <Tab value="network">Network</Tab>
              <Tab value="processes">Processes</Tab>
            </TabList>
          </Box>

          <TabPanel value="cpu">
            <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
              <CpuPane cores={state.cores} />
            </Box>
          </TabPanel>
          <TabPanel value="memory">
            <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
              <MemoryPane memory={state.memory} />
            </Box>
          </TabPanel>
          <TabPanel value="network">
            <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
              <NetworkPane network={state.network} />
            </Box>
          </TabPanel>
          <TabPanel value="processes">
            <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
              <ProcessPane processes={state.processes} />
            </Box>
          </TabPanel>
        </Tabs>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text>
          <Strong>System Monitor</Strong>
        </Text>
      </Box>
      <WideLayout cores={state.cores} memory={state.memory} network={state.network} processes={state.processes} />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tabs  Esc/q quit">
      <Dashboard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
