/**
 * AI Coding Agent — thin wrapper around static-scrollback.tsx
 *
 * The scrollback demo IS the coding agent showcase. This file exists
 * so that `bun examples/interactive/ai-chat.tsx` still works and docs
 * references to "ai-chat" resolve.
 */

// Re-export meta for the example viewer
export { meta } from "./static-scrollback.js"

// When run directly, delegate to static-scrollback's main()
if (import.meta.main) {
  const { main } = await import("./static-scrollback.js")
  await main()
}
