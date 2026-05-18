import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function wheelUpBurst(x: number, y: number, count: number): string {
  return Array.from({ length: count }, () => `\x1b[<64;${x + 1};${y + 1}M`).join("")
}

describe("runtime wheel coalescing", () => {
  test("same-chunk SGR wheel burst dispatches as one distance-preserving wheel event", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const wheelDeltas: number[] = []

    function App(): React.ReactElement {
      return (
        <Box width={24} height={6} onWheel={(event) => wheelDeltas.push(event.deltaY)}>
          <Text>scroll target</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    ;(term as unknown as { sendInput(data: string): void }).sendInput(wheelUpBurst(2, 0, 12))
    await settle()

    handle.unmount()

    expect(wheelDeltas).toEqual([-12])
  })
})
