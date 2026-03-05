/**
 * Demo: Progress bar with phases
 *
 * Run: bun examples/demo-progress.ts
 */

import { withProgress } from "../src/wrappers/with-progress.js"
import type { ProgressCallback } from "../src/types.js"

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Simulate a multi-phase operation (like km sync)
async function simulateSync(onProgress: ProgressCallback) {
  const phases = [
    { name: "scanning", total: 50 },
    { name: "reconciling", total: 100 },
    { name: "rules", total: 30 },
  ]

  for (const phase of phases) {
    for (let i = 0; i <= phase.total; i++) {
      onProgress({ phase: phase.name, current: i, total: phase.total })
      await sleep(30)
    }
  }

  return { processed: 180, duration: 5400 }
}

async function demo() {
  console.log("progressx - Multi-phase Progress Demo\n")

  const result = await withProgress(simulateSync, {
    phases: {
      scanning: "Scanning files",
      reconciling: "Reconciling changes",
      rules: "Evaluating rules",
    },
  })

  console.log(`\n✨ Processed ${result.processed} items in ${result.duration}ms`)
}

void demo()
