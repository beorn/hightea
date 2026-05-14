// @ts-nocheck
/**
 * Fixture 03 — align="stretch" literal → DROP alignSelf entirely.
 * AutoFit's "stretch" was a ceiling-bypass; fitWidth fills available slack
 * natively.
 */
import React from "react"
import { Box } from "silvery"

export function StretchLane(): React.ReactElement {
  return (
    <Box fitWidth={[120]} minWidth={0}>
      <Box>fill available</Box>
    </Box>
  )
}
