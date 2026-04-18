#!/usr/bin/env bun
/**
 * Validate every bundled scheme against the new theme invariants.
 * Run this from the km root.
 */
import { loadTheme, validateThemeInvariants, formatViolations } from "@silvery/ansi"
import { builtinPalettes } from "@silvery/theme/schemes"

let passed = 0
let failed = 0
const fails: Array<{ name: string; msg: string }> = []

for (const [name, scheme] of Object.entries(builtinPalettes)) {
  try {
    const theme = loadTheme(scheme as any, { enforce: "strict" })
    void theme
    passed++
  } catch (e) {
    failed++
    fails.push({ name, msg: (e as Error).message.slice(0, 800) })
  }
}

console.log(`\nBundled scheme validation: ${passed} passed, ${failed} failed of ${passed + failed}`)
if (failed > 0) {
  console.log(`\nFailures:`)
  for (const f of fails) console.log(`\n== ${f.name} ==\n${f.msg}`)
}
