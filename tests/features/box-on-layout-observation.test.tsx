import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { hasObservedLayoutSignal } from "@silvery/ag/layout-signals"
import { Box, Text, type BoxHandle } from "silvery"

describe("Box onLayout layout-signal observation", () => {
  test("removing onLayout releases the boxRect observation", () => {
    const render = createRenderer({ cols: 24, rows: 6 })
    const ref = React.createRef<BoxHandle>()

    function App({ measured }: { measured: boolean }): React.ReactElement {
      return (
        <Box ref={ref} width={12} height={2} onLayout={measured ? () => {} : undefined}>
          <Text>measured</Text>
        </Box>
      )
    }

    const app = render(<App measured />)
    const node = ref.current?.getNode()
    expect(node).toBeDefined()
    expect(hasObservedLayoutSignal(node!, "boxRect")).toBe(true)

    app.rerender(<App measured={false} />)
    expect(hasObservedLayoutSignal(node!, "boxRect")).toBe(false)

    app.unmount()
  })
})
