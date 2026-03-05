/**
 * Demo: Spinner styles
 *
 * Run: bun examples/demo-spinner.ts
 * Record with: asciinema rec demo.cast && agg demo.cast demo.gif
 */

import { Spinner } from "../src/cli/spinner.js"

const styles = ["dots", "line", "arc", "bounce", "pulse"] as const

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function demo() {
  console.log("progressx - Spinner Styles Demo\n")

  for (const style of styles) {
    const spinner = new Spinner({
      text: `Style: ${style}`,
      style,
    })

    spinner.start()
    await sleep(2000)
    spinner.succeed(`${style} complete`)
  }

  console.log("\n✨ Demo complete!")
}

void demo()
