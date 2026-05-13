/**
 * Fixture 02 — align="center" literal → alignSelf="center".
 */
import React from "react"
import { AutoFit, Box } from "silvery"

export function CenteredLane(): React.ReactElement {
  return (
    <AutoFit lanes={[88, 120]} align="center">
      <Box>centered content</Box>
    </AutoFit>
  )
}
