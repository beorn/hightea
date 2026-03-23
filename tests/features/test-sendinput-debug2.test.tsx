import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "@silvery/ag-term/runtime"
import { Text, useModifierKeys } from "@silvery/ag-react"

describe("sendInput debug2", () => {
  test("isFullProvider check", async () => {
    const term = createTermless({ cols: 40, rows: 5 })

    // Manually check isFullProvider conditions
    const isObj = term !== null && (typeof term === "object" || typeof term === "function")
    const hasGS = "getState" in term
    const hasSub = "subscribe" in term
    const hasEv = "events" in term
    const gsType = typeof (term as any).getState
    const subType = typeof (term as any).subscribe
    const evType = typeof (term as any).events
    const hasSI = "sendInput" in term

    // These should all be true for the term to be used as a provider
    expect(isObj).toBe(true)
    expect(hasGS).toBe(true)
    expect(hasSub).toBe(true)
    expect(hasEv).toBe(true)
    expect(gsType).toBe("function")
    expect(subType).toBe("function")
    expect(evType).toBe("function")
    expect(hasSI).toBe(true)
  })
})
