/**
 * ListView v5 cache mode tests.
 *
 * Verifies:
 * - Items freeze when isCacheable returns true (contiguous prefix)
 * - Frozen items leave the React tree
 * - Only contiguous prefix is frozen (gap breaks it)
 * - ListCache domain object works when passed directly
 * - Basic rendering without cache
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import { ListView, type ListItemMeta } from "../../packages/ui/src/components/ListView"
import { createListCache } from "../../packages/term/src/list-cache"

// ============================================================================
// Test Helpers
// ============================================================================

interface Message {
  id: string
  body: string
  delivered: boolean
}

// ============================================================================
// Tests
// ============================================================================

describe("ListView cache", () => {
  // ── Basic rendering (no cache) ────────────────────────────────

  test("renders all items with no cache", () => {
    const items: Message[] = [
      { id: "1", body: "Hello", delivered: false },
      { id: "2", body: "World", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView items={items} getKey={(m) => m.id} height={10} renderItem={(msg) => <Text>{msg.body}</Text>} />,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("Hello")
    expect(text).toContain("World")
  })

  // ── Cache: isCacheable ────────────────────────────────────────

  test("isCacheable removes frozen items from live render", () => {
    const items: Message[] = [
      { id: "1", body: "Delivered msg", delivered: true },
      { id: "2", body: "Also delivered", delivered: true },
      { id: "3", body: "Still pending", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{ isCacheable: (m) => (m as Message).delivered }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    // Frozen items should NOT appear in live render
    expect(text).not.toContain("Delivered msg")
    expect(text).not.toContain("Also delivered")
    // Non-frozen items should still render
    expect(text).toContain("Still pending")
  })

  test("only freezes contiguous prefix", () => {
    const items: Message[] = [
      { id: "1", body: "Done 1", delivered: true },
      { id: "2", body: "Not done", delivered: false },
      { id: "3", body: "Done 2", delivered: true }, // NOT frozen (gap in prefix)
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{ isCacheable: (m) => (m as Message).delivered }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).not.toContain("Done 1") // frozen (contiguous prefix)
    expect(text).toContain("Not done") // not frozen
    expect(text).toContain("Done 2") // not frozen (gap breaks prefix)
  })

  // ── cache={true} uses defaults ────────────────────────────────

  test("cache={true} freezes everything by default", () => {
    const items: Message[] = [
      { id: "1", body: "msg 1", delivered: true },
      { id: "2", body: "msg 2", delivered: true },
      { id: "3", body: "msg 3", delivered: true },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView items={items} getKey={(m) => m.id} height={10} cache renderItem={(msg) => <Text>{msg.body}</Text>} />,
    )

    const text = stripAnsi(app.text)
    // Default isCacheable returns true for everything — all frozen
    expect(text).not.toContain("msg 1")
    expect(text).not.toContain("msg 2")
    expect(text).not.toContain("msg 3")
  })

  // ── External domain object ────────────────────────────────────

  test("external ListCache domain object works", () => {
    const cache = createListCache<Message>({
      isCacheable: (m) => m.delivered,
    })

    const items: Message[] = [
      { id: "1", body: "Cached", delivered: true },
      { id: "2", body: "Live", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={cache}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).not.toContain("Cached")
    expect(text).toContain("Live")

    // Domain object reflects state
    expect(cache.frozenCount).toBe(1)
    expect(cache.getEntry("1")).toEqual({ key: "1", index: 0 })
  })

  // ── Imperative freeze ─────────────────────────────────────────

  test("imperative freeze works", () => {
    // isCacheable returns false — only manual freeze triggers caching
    const cache = createListCache<Message>({
      isCacheable: () => false,
    })

    const items: Message[] = [
      { id: "1", body: "First", delivered: false },
      { id: "2", body: "Second", delivered: false },
    ]

    // Imperatively freeze the first item
    cache.freeze("1")

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={cache}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).not.toContain("First") // manually frozen
    expect(text).toContain("Second") // not frozen
    expect(cache.frozenCount).toBe(1)
  })
})
