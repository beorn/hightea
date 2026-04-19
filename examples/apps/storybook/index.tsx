/**
 * Sterling Storybook — entry point.
 *
 * Launch:
 *   bun examples/apps/storybook/index.tsx
 *   # or via the workspace script:
 *   bun run example:storybook
 *
 * See App.tsx for the MVP scope + sterling-storybook-mvp bead.
 */

import React from "react"
import { render, createTerm } from "silvery"
import type { ExampleMeta } from "../../_banner.tsx"
import { App } from "./App.tsx"

export const meta: ExampleMeta = {
  name: "Sterling Storybook",
  description: "Interactive 3-pane design-system explorer — 84 schemes, live swap, token tree",
  demo: true,
  features: [
    "sterling.deriveFromScheme",
    "derivationTrace",
    "ThemeProvider",
    "builtinPalettes",
    "SelectList",
  ],
}

export async function main(): Promise<void> {
  using term = createTerm()
  const { waitUntilExit } = await render(<App />, term)
  await waitUntilExit()
}

// Auto-run when invoked directly (bun examples/apps/storybook/index.tsx)
if (import.meta.main) {
  await main()
}
