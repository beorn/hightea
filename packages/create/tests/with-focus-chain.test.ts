/**
 * withFocusChain tests — focused-element dispatch, precedence vs useInput.
 */

import { describe, expect, test, vi } from "vitest"
import { pipe } from "../src/pipe"
import { createBaseApp } from "../src/runtime/base-app"
import { withFocusChain } from "../src/runtime/with-focus-chain"
import { withInputChain } from "../src/runtime/with-input-chain"
import type { KeyShape } from "../src/runtime/with-terminal-chain"

function pressKey(
  app: { dispatch: (op: { type: string; input: string; key: KeyShape }) => void },
  input: string,
  extra: Partial<KeyShape> = {},
) {
  app.dispatch({ type: "input:key", input, key: { eventType: "press", ...extra } as KeyShape })
}

describe("withFocusChain", () => {
  test("no active focus → dispatchKey is still called (fallback navigation runs)", () => {
    // Previously this plugin short-circuited on `!hasActiveFocus()`, which
    // also suppressed the intended "Tab focuses the first focusable when
    // nothing is active" fallback that `handleFocusNavigation` supports.
    // The caller-supplied `dispatchKey` is now invoked unconditionally;
    // it remains responsible for deciding whether to act on activeElement
    // (focused-event dispatch) vs the focusless fallback (focusNext/Prev).
    const dispatchKey = vi.fn(() => false) // returning false = not consumed
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => false })(createBaseApp())
    pressKey(app, "j")
    expect(dispatchKey).toHaveBeenCalledWith("j", expect.objectContaining({ eventType: "press" }))
    expect(app.focusChain.lastConsumed).toBe(false)
  })

  test("active focus + handler returns true → consumed, render effect, no pass-through", () => {
    const dispatchKey = vi.fn(() => true)
    const innerPrev = createBaseApp()
    let innerSaw = false
    const basePrev = innerPrev.apply
    innerPrev.apply = (op) => {
      innerSaw = true
      return basePrev(op)
    }
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(innerPrev)
    pressKey(app, "a")
    expect(dispatchKey).toHaveBeenCalledWith("a", expect.objectContaining({ eventType: "press" }))
    expect(app.focusChain.lastConsumed).toBe(true)
    expect(innerSaw).toBe(false) // short-circuited
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("active focus + handler returns false → falls through to next plugin", () => {
    const dispatchKey = vi.fn(() => false)
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    pressKey(app, "k")
    expect(dispatchKey).toHaveBeenCalled()
    expect(seen).toEqual(["k"]) // useInput fallback saw it
    expect(app.focusChain.lastConsumed).toBe(false)
  })

  test("precedence: focused consumes first, useInput never sees it", () => {
    const dispatchKey = vi.fn(() => true)
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const seen: string[] = []
    app.input.register(() => {
      seen.push("useInput ran")
    })
    pressKey(app, "a")
    expect(seen).toEqual([]) // critical: the whole point of the precedence
    expect(dispatchKey).toHaveBeenCalledTimes(1)
  })

  test("release events skip focus dispatch by default", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } as KeyShape })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("modifier-only events (isModifierOnly: true) skip focus dispatch by default", () => {
    // `isModifierOnly` is the authoritative flag — set by
    // @silvery/ag/keys `parseKey()` when the key NAME is a dedicated
    // Kitty modifier codepoint. Derived heuristics like "input === '' &&
    // some modifier flag" are wrong — see Shift+Tab/Shift+Enter regression.
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({
      type: "input:key",
      input: "",
      key: { shift: true, isModifierOnly: true, eventType: "press" } as KeyShape,
    })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("Shift+Tab-shape event (empty input + shift, NOT modifier-only) reaches focus dispatch", () => {
    // Regression: `isModifierOnly(input,key)` used to derive from
    // `input === "" && (shift|ctrl|...)`, silently swallowing Shift+Tab,
    // Ctrl+Tab, Shift+Enter, Shift+Arrow, etc.
    const dispatchKey = vi.fn(() => false) // not consumed → falls through
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({
      type: "input:key",
      input: "",
      // Shape emitted by parseKey for CSI 9;2u (Shift+Tab).
      key: { shift: true, eventType: "press" } as KeyShape,
    })
    expect(dispatchKey).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ shift: true, eventType: "press" }),
    )
  })

  test("dispatchReleaseAndModifierOnly=true forwards release events", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({
      dispatchKey,
      hasActiveFocus: () => true,
      dispatchReleaseAndModifierOnly: true,
    })(createBaseApp())
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } as KeyShape })
    expect(dispatchKey).toHaveBeenCalled()
  })

  test("non input:key ops pass through untouched", () => {
    const dispatchKey = vi.fn()
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({ type: "term:resize", cols: 80, rows: 24 })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("throwing dispatchKey surfaces to console but does not crash", () => {
    const dispatchKey = vi.fn(() => {
      throw new Error("focus boom")
    })
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const origError = console.error
    console.error = () => {}
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    try {
      pressKey(app, "x")
    } finally {
      console.error = origError
    }
    // dispatchKey threw → lastConsumed stays false → useInput fallback sees it.
    expect(seen).toEqual(["x"])
  })
})
