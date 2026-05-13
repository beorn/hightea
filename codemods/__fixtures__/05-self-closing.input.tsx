/**
 * Fixture 05 — self-closing AutoFit (no children — rare but valid JSX).
 * Verifies the codemod handles the self-closing JSX form.
 */
import React from "react"
import { AutoFit } from "silvery"

export function Empty(): React.ReactElement {
  return <AutoFit lanes={[60, 80]} />
}
