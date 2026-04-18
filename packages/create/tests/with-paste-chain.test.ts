/**
 * withPasteChain tests — focused route > global usePaste handlers.
 */

import { describe, expect, test, vi } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withPasteChain } from "../src/runtime/with-paste-chain"

function mkApp(route?: (text: string) => boolean) {
  return withPasteChain({ routeToFocused: route })(createBaseApp())
}

describe("withPasteChain", () => {
  test("paste event reaches registered handlers when no focused route", () => {
    const app = mkApp()
    const seen: string[] = []
    app.paste.register((text) => seen.push(text))
    app.dispatch({ type: "term:paste", text: "hello" })
    expect(seen).toEqual(["hello"])
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("handlers fire in registration order", () => {
    const app = mkApp()
    const seen: string[] = []
    app.paste.register(() => seen.push("one"))
    app.paste.register(() => seen.push("two"))
    app.dispatch({ type: "term:paste", text: "x" })
    expect(seen).toEqual(["one", "two"])
  })

  test("unregister stops a handler from firing", () => {
    const app = mkApp()
    const seen: string[] = []
    const off = app.paste.register(() => seen.push("a"))
    off()
    app.dispatch({ type: "term:paste", text: "y" })
    expect(seen).toEqual([])
    // No handler, no focus route -> pass-through, no render effect.
    expect(app.drainEffects()).toEqual([])
  })

  test("focused route consumes paste; global handlers are skipped", () => {
    const route = vi.fn(() => true)
    const app = mkApp(route)
    const seen: string[] = []
    app.paste.register(() => seen.push("global"))
    app.dispatch({ type: "term:paste", text: "focused-wins" })
    expect(route).toHaveBeenCalledWith("focused-wins")
    expect(seen).toEqual([])
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("focused route returning false → falls through to global handlers", () => {
    const route = vi.fn(() => false)
    const app = mkApp(route)
    const seen: string[] = []
    app.paste.register((text) => seen.push(text))
    app.dispatch({ type: "term:paste", text: "fallback" })
    expect(route).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(["fallback"])
  })

  test("focused route throwing does not crash the chain", () => {
    const app = mkApp(() => {
      throw new Error("route boom")
    })
    const seen: string[] = []
    app.paste.register((text) => seen.push(text))
    const origError = console.error
    console.error = () => {}
    try {
      app.dispatch({ type: "term:paste", text: "resilient" })
    } finally {
      console.error = origError
    }
    expect(seen).toEqual(["resilient"])
  })

  test("handler throwing: other handlers still run", () => {
    const app = mkApp()
    const seen: string[] = []
    app.paste.register(() => {
      throw new Error("boom")
    })
    app.paste.register(() => seen.push("after-boom"))
    const origError = console.error
    console.error = () => {}
    try {
      app.dispatch({ type: "term:paste", text: "x" })
    } finally {
      console.error = origError
    }
    expect(seen).toEqual(["after-boom"])
  })

  test("unrelated op passes through", () => {
    const app = mkApp()
    app.dispatch({ type: "noop" })
    expect(app.drainEffects()).toEqual([])
  })

  test("empty text is routed normally", () => {
    const app = mkApp()
    const seen: string[] = []
    app.paste.register((text) => seen.push(`<${text}>`))
    app.dispatch({ type: "term:paste", text: "" })
    expect(seen).toEqual(["<>"])
  })

  test("paste with no handlers and no route = no effects", () => {
    const app = mkApp()
    app.dispatch({ type: "term:paste", text: "lonely" })
    expect(app.drainEffects()).toEqual([])
  })
})
