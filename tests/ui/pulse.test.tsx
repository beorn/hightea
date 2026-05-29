import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { StyleProps } from "@silvery/ag/types"
import { createScope, type Scope } from "@silvery/scope"
import { createRenderer } from "@silvery/test"
import { Pulse, ScopeProvider, Text, usePulse } from "silvery"

function withScope(scope: Scope, element: React.ReactElement): React.ReactElement {
  return (
    <ScopeProvider appScope={scope} scope={scope}>
      {element}
    </ScopeProvider>
  )
}

function colorOf(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  text: string,
): string | undefined {
  const node = app.getByText(text).resolve()
  return (node?.props as StyleProps | undefined)?.color as string | undefined
}

function PulseProbe(props: Parameters<typeof usePulse>[0]): React.ReactElement {
  const on = usePulse(props)
  return <Text>{on ? "pulse-on" : "pulse-off"}</Text>
}

describe("usePulse", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("alternates phase across the interval boundary", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-test")
    const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

    expect(app.text).toContain("pulse-on")
    await vi.advanceTimersByTimeAsync(499)
    app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
    expect(app.text).toContain("pulse-on")

    await vi.advanceTimersByTimeAsync(1)
    app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
    expect(app.text).toContain("pulse-off")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("unmount cancels the owned interval", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-cleanup-test")
    const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

    expect(vi.getTimerCount()).toBe(1)
    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)

    await scope[Symbol.asyncDispose]()
  })

  test("prefers-reduced-motion: reduce disables the interval and keeps the first phase", async () => {
    const original = globalThis.matchMedia
    const reducedMotionList: MediaQueryList = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => reducedMotionList),
    })

    try {
      const render = createRenderer({ cols: 40, rows: 4 })
      const scope = createScope("pulse-reduced-motion-test")
      const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

      expect(app.text).toContain("pulse-on")
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(1_500)
      app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
      expect(app.text).toContain("pulse-on")

      app.unmount()
      await scope[Symbol.asyncDispose]()
    } finally {
      Object.defineProperty(globalThis, "matchMedia", {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })
})

describe("<Pulse>", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("alternates color tokens with the pulse phase", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-component-test")
    const tree = () =>
      withScope(
        scope,
        <Pulse intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
          rec-dot
        </Pulse>,
      )

    const app = render(tree())
    expect(colorOf(app, "rec-dot")).toBe("$fg-error")

    await vi.advanceTimersByTimeAsync(500)
    app.rerender(tree())
    expect(colorOf(app, "rec-dot")).toBe("$fg-muted")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })
})
