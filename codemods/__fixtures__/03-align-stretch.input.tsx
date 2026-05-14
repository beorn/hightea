// @ts-nocheck
/**
 * Fixture 03 — align="stretch" literal → DROP alignSelf entirely.
 * AutoFit's "stretch" was a ceiling-bypass; fitWidth fills available slack
 * natively.
 */
import React from "react"
import { AutoFit, Box } from "silvery"

export function StretchLane(): React.ReactElement {
  return (
    <AutoFit lanes={[120]} align="stretch">
      <Box>fill available</Box>
    </AutoFit>
  )
}
