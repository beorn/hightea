/**
 * BaseApp contract tests — lock in the apply-chain semantics.
 *
 * These tests mirror the v1r prototype's invariants:
 *   - base apply returns false (nothing handled)
 *   - reentrant dispatch throws
 *   - Effect[] = handled channel
 *   - dispatch-effects re-enter via the queue, not via nested dispatch()
 *   - non-dispatch effects bubble up to the runner via drainEffects()
 */

import { describe, expect, test } from "vitest"
import { createBaseApp, wrapApply } from "../src/runtime/base-app"
import type { ApplyResult, Effect, Op } from "../src/types"

describe("createBaseApp", () => {
  test("base apply returns false (nothing handled)", () => {
    const app = createBaseApp()
    expect(app.apply({ type: "whatever" })).toBe(false)
  })

  test("dispatch on unhandled op leaves drainEffects empty", () => {
    const app = createBaseApp()
    app.dispatch({ type: "noop" })
    expect(app.drainEffects()).toEqual([])
  })

  test("plugin can handle an op and emit runner effects", () => {
    const app = createBaseApp()
    wrapApply(app, (op, prev) => {
      if (op.type === "ping") return [{ type: "render" }]
      return prev(op)
    })
    app.dispatch({ type: "ping" })
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("drainEffects clears the pending queue", () => {
    const app = createBaseApp()
    wrapApply(app, () => [{ type: "render" }])
    app.dispatch({ type: "x" })
    expect(app.drainEffects()).toHaveLength(1)
    expect(app.drainEffects()).toEqual([])
  })

  test("reentrant dispatch throws", () => {
    const app = createBaseApp()
    wrapApply(app, (op) => {
      if (op.type === "outer") {
        // Direct re-entry is forbidden — must use a dispatch effect instead.
        app.dispatch({ type: "inner" })
        return []
      }
      return false
    })
    expect(() => app.dispatch({ type: "outer" })).toThrow(/Reentrant dispatch/)
  })

  test("dispatch effect re-enters the chain via the drain queue", () => {
    const app = createBaseApp()
    const seen: string[] = []
    wrapApply(app, (op, prev) => {
      seen.push(op.type)
      if (op.type === "a") {
        return [{ type: "dispatch", op: { type: "b" } } as Effect]
      }
      return prev(op)
    })
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b"])
  })

  test("plugin ordering — last plugin wraps outermost (runs first)", () => {
    const app = createBaseApp()
    const order: string[] = []
    wrapApply(app, (op, prev) => {
      order.push("inner")
      return prev(op)
    })
    wrapApply(app, (op, prev) => {
      order.push("outer")
      return prev(op)
    })
    app.dispatch({ type: "x" })
    expect(order).toEqual(["outer", "inner"])
  })

  test("handled (empty effects) short-circuits downstream plugins", () => {
    const app = createBaseApp()
    let innerRan = false
    wrapApply(app, (op, prev) => {
      innerRan = true
      return prev(op)
    })
    wrapApply(app, () => [])
    app.dispatch({ type: "consumed" })
    expect(innerRan).toBe(false)
  })

  test("unhandled pass-through — inner plugin runs when outer returns false", () => {
    const app = createBaseApp()
    let innerRan = false
    wrapApply(app, (op, prev) => {
      if (op.type === "inner-only") {
        innerRan = true
        return []
      }
      return prev(op)
    })
    wrapApply(app, (_op, prev) => prev(_op)) // outer: pure pass-through
    app.dispatch({ type: "inner-only" })
    expect(innerRan).toBe(true)
  })

  test("runner effects accumulate across multiple dispatches", () => {
    const app = createBaseApp()
    wrapApply(app, (op) => {
      if (op.type === "paint") return [{ type: "render" }]
      return false
    })
    app.dispatch({ type: "paint" })
    app.dispatch({ type: "paint" })
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "render" }])
  })

  test("dispatch-effect chain A→B→C via queue, runner effects bubble up", () => {
    const app = createBaseApp()
    const seen: string[] = []
    wrapApply(app, (op) => {
      seen.push(op.type)
      if (op.type === "a") return [{ type: "dispatch", op: { type: "b" } } as Effect]
      if (op.type === "b") return [{ type: "dispatch", op: { type: "c" } } as Effect, { type: "render" }]
      if (op.type === "c") return [{ type: "exit" }]
      return false
    })
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b", "c"])
    // Non-dispatch effects (render, exit) bubble up to the runner:
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "exit" }])
  })

  test("malformed dispatch-effect (no `op`) is silently dropped", () => {
    const app = createBaseApp()
    wrapApply(app, (op) => {
      if (op.type === "a") return [{ type: "dispatch" } as Effect]
      return false
    })
    expect(() => app.dispatch({ type: "a" })).not.toThrow()
    expect(app.drainEffects()).toEqual([])
  })
})

describe("wrapApply", () => {
  test("wrapApply preserves prevApply as closure, not prototype chain", () => {
    const app = createBaseApp()
    let capturedPrev: ((op: Op) => ApplyResult) | null = null
    wrapApply(app, (op, prev) => {
      capturedPrev = prev
      return prev(op)
    })
    app.dispatch({ type: "any" })
    expect(capturedPrev).not.toBeNull()
    // The captured prev should refer to the base apply (returns false),
    // not the wrapped one (avoiding infinite recursion).
    expect(capturedPrev!({ type: "any" })).toBe(false)
  })
})
