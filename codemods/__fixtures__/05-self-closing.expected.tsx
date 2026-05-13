/**
 * Fixture 05 — self-closing AutoFit (no children — rare but valid JSX).
 * Verifies the codemod handles the self-closing JSX form.
 */
import React from "react"
import { Box } from "silvery"

export function Empty(): React.ReactElement {
  return <Box fitWidth={[60, 80]} alignSelf="flex-start" minWidth={0} />
}
