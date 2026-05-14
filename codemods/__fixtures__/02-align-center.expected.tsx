// @ts-nocheck
/**
 * Fixture 02 — align="center" literal → alignSelf="center".
 */
import React from "react"
import { Box } from "silvery"

export function CenteredLane(): React.ReactElement {
  return (
    <Box fitWidth={[88, 120]} alignSelf="center" minWidth={0}>
      <Box>centered content</Box>
    </Box>
  )
}
