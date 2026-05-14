// @ts-nocheck
/**
 * Fixture 01 — default align (no prop). AutoFit defaults to align="start"
 * → alignSelf="flex-start" must be emitted to preserve behavior.
 */
import React from "react"
import { Box } from "silvery"

export function NoAlign(): React.ReactElement {
  return (
    <Box fitWidth={[40, 80, 120]} alignSelf="flex-start" minWidth={0}>
      <Box>content</Box>
    </Box>
  )
}
