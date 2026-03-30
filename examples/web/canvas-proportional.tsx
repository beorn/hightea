/**
 * Silvery Canvas — Proportional Text Demo
 *
 * Same React components as terminal, rendered on canvas with proportional fonts.
 * Uses renderToCanvas({ monospace: false }) for pixel-based layout.
 */

import React from "react"
import { renderToCanvas, Box, Text } from "../../packages/ag-react/src/ui/canvas/index.js"

// Simple test: does text wrap and do backgrounds render?
function App() {
  return (
    <Box flexDirection="column" width={480} padding={16}>
      <Box backgroundColor="#1f6feb" paddingX={8} paddingY={4}>
        <Text color="#ffffff" bold>Proportional Canvas Demo</Text>
      </Box>

      <Box marginTop={8} backgroundColor="#161b22" paddingX={8} paddingY={4}>
        <Text color="#e6edf3" wrap="wrap">
          This text should wrap within its container. If you can read this entire sentence without it overflowing the right edge, text wrapping is working correctly in proportional pixel mode.
        </Text>
      </Box>

      <Box marginTop={8} flexDirection="row" gap={8}>
        <Box backgroundColor="#da3633" paddingX={8} paddingY={4}>
          <Text color="#ffffff">Red</Text>
        </Box>
        <Box backgroundColor="#2ea043" paddingX={8} paddingY={4}>
          <Text color="#ffffff">Green</Text>
        </Box>
        <Box backgroundColor="#1f6feb" paddingX={8} paddingY={4}>
          <Text color="#ffffff">Blue</Text>
        </Box>
      </Box>

      <Box marginTop={8} backgroundColor="#161b22" paddingX={8} paddingY={4}>
        <Text color="#8b949e">Emoji: 🚀 CJK: 春天到了 Mixed: hello 世界</Text>
      </Box>
    </Box>
  )
}

document.fonts.ready.then(() => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  if (!canvas) return
  try {
    const instance = renderToCanvas(<App />, canvas, {
      monospace: false,
      fontSize: 14,
      fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
      lineHeight: 1.4,
      backgroundColor: "#0d1117",
      foregroundColor: "#e6edf3",
    })
    const buf = instance.getBuffer() as any
    document.getElementById("debug")!.textContent = buf
      ? `buffer: ${buf.width}x${buf.height}`
      : "no buffer"
  } catch (e) {
    console.error("renderToCanvas failed:", e)
    document.body.innerHTML += `<pre style="color:red;margin:20px">${e}\n${(e as Error).stack}</pre>`
  }
})
