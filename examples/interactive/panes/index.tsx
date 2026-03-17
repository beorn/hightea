/**
 * Panes — tmux-style split pane demo using ListView v5 API.
 *
 * Two AI chat panes running independently, Tab to switch focus, Esc to quit.
 * No SearchProvider/SurfaceRegistry — search is built into ListView.
 *
 * Run: bun examples/interactive/panes/index.tsx [--fast]
 */

import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, ListView, Pane } from "silvery"
import { run, useInput, type Key } from "@silvery/term/runtime"
import type { ExampleMeta } from "../../_banner.js"
import { SCRIPT } from "../aichat/script.js"
import type { ScriptEntry } from "../aichat/types.js"
import type { Exchange } from "../aichat/types.js"
import { ExchangeItem } from "../aichat/components.js"
import type { ListItemMeta } from "silvery"

export const meta: ExampleMeta = {
  name: "Panes",
  description: "tmux-style split panes — ListView v5 + Pane + cache/search",
  demo: true,
  features: ["ListView", "Pane", "split panes", "Tab focus", "cache", "search"],
}

// ============================================================================
// Auto-advancing chat content
// ============================================================================

function usePaneContent(script: ScriptEntry[], fastMode: boolean): Exchange[] {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (idx >= script.length) return
    const delay = fastMode ? 150 : 800 + Math.random() * 1200
    const timer = setTimeout(() => {
      const entry = script[idx]!
      setExchanges((prev) => [...prev, { ...entry, id: idx }])
      setIdx((i) => i + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [idx, script, fastMode])

  return exchanges
}

// ============================================================================
// Chat pane content
// ============================================================================

function ChatPaneContent({
  script,
  fastMode,
  height,
  active,
}: {
  script: ScriptEntry[]
  fastMode: boolean
  height: number
  active: boolean
}) {
  const exchanges = usePaneContent(script, fastMode)

  if (exchanges.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="$muted">Waiting...</Text>
      </Box>
    )
  }

  return (
    <ListView
      items={exchanges}
      height={height}
      getKey={(ex: Exchange) => ex.id}
      cache={{ isCacheable: (_ex: Exchange, idx: number) => idx < exchanges.length - 1 }}
      navigator
      search={{ getText: (ex: Exchange) => ex.content }}
      followOutput
      active={active}
      renderItem={(exchange: Exchange, _index: number, _meta: ListItemMeta) => (
        <ExchangeItem
          exchange={exchange}
          streamPhase="done"
          revealFraction={1}
          pulse={false}
          isLatest={false}
          isFirstInGroup={true}
          isLastInGroup={true}
        />
      )}
    />
  )
}

// ============================================================================
// Main app
// ============================================================================

function PanesApp({ fastMode, rows }: { fastMode: boolean; rows: number }) {
  const [focusedPane, setFocusedPane] = useState<"left" | "right">("left")

  const midpoint = Math.ceil(SCRIPT.length / 2)
  const leftScript = useMemo(() => SCRIPT.slice(0, midpoint), [midpoint])
  const rightScript = useMemo(() => SCRIPT.slice(midpoint), [midpoint])

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.tab) {
      setFocusedPane((p) => (p === "left" ? "right" : "left"))
    }
  })

  // Pane content height: rows - border(2) - title(1) - status(1) = rows - 4
  const listHeight = Math.max(5, rows - 4)

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="row" flexGrow={1}>
        <Pane title="Agent A" width="50%">
          <ChatPaneContent
            script={leftScript}
            fastMode={fastMode}
            height={listHeight}
            active={focusedPane === "left"}
          />
        </Pane>
        <Pane title="Agent B" width="50%">
          <ChatPaneContent
            script={rightScript}
            fastMode={fastMode}
            height={listHeight}
            active={focusedPane === "right"}
          />
        </Pane>
      </Box>
      <Box paddingX={1}>
        <Text color="$muted">Tab: switch pane · Ctrl+F: search · j/k: navigate · Esc: quit</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Entry
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const fastMode = args.includes("--fast")
  const rows = process.stdout.rows ?? 40

  using handle = await run(<PanesApp fastMode={fastMode} rows={rows} />, {
    mode: "fullscreen",
    kitty: false,
    textSizing: false,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
