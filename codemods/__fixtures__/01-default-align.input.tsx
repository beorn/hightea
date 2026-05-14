// @ts-nocheck
/**
 * Fixture 01 — default align (no prop). AutoFit defaults to align="start"
 * → alignSelf="flex-start" must be emitted to preserve behavior.
 */
import React from "react"
import { AutoFit, Box } from "silvery"

export function NoAlign(): React.ReactElement {
  return (
    <AutoFit lanes={[40, 80, 120]}>
      <Box>content</Box>
    </AutoFit>
  )
}
