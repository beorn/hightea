import React from "react"
import { Box, Text } from "@silvery/ag-react"
import { createTerm } from "@silvery/ag-term"
import { run } from "silvery/runtime"
import { useInput } from "silvery/runtime"

function App() {
  useInput((_input, key) => {
    if (key.escape) return "exit"
  })
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Two flexGrow=1 panels</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Right</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Three flexGrow=1</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Middle</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Right</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width={30} borderStyle="single">
          <Text>Fixed 30</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>flexGrow=1 fills rest</Text>
        </Box>
      </Box>
    </Box>
  )
}

using term = createTerm()
const handle = await run(<App />, term)
await handle.waitUntilExit()
