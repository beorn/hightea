#!/usr/bin/env bun
/**
 * Ink/Chalk compatibility checker.
 *
 * Clones the Ink and Chalk test suites, runs them against silvery's
 * compat layer (silvery/ink, silvery/chalk) via vitest resolve aliases,
 * and reports pass/fail per file.
 *
 * Usage:
 *   bun run compat          # run all
 *   bun run compat ink      # ink only
 *   bun run compat chalk    # chalk only
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { $ } from "bun"

const SILVERY_ROOT = join(import.meta.dir, "..")
const CLONE_DIR = "/tmp/silvery-compat"
const INK_DIR = join(CLONE_DIR, "ink")
const CHALK_DIR = join(CLONE_DIR, "chalk")

const INK_REPO = "https://github.com/vadimdemedes/ink.git"
const CHALK_REPO = "https://github.com/chalk/chalk.git"

const target = process.argv[2] // "ink", "chalk", or undefined (both)

async function cloneIfNeeded(repo: string, dir: string, name: string) {
	if (existsSync(dir)) {
		console.log(`  ${name}: using cached clone at ${dir}`)
		console.log(`  (delete ${dir} to re-clone)`)
		return
	}
	console.log(`  ${name}: cloning ${repo}...`)
	await $`git clone --depth=1 ${repo} ${dir}`.quiet()
	console.log(`  ${name}: done`)
}

async function runInkTests() {
	console.log("\n--- Ink Compatibility ---\n")

	await cloneIfNeeded(INK_REPO, INK_DIR, "ink")

	// Ink uses ava + ts. We run vitest with resolve aliases instead.
	// Write a temporary vitest config that aliases ink → silvery/ink
	const configPath = join(CLONE_DIR, "vitest.config.ink.ts")
	const config = `
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "ink": path.resolve("${SILVERY_ROOT}/packages/compat/src/ink.ts"),
      "#ansi-escapes": "ansi-escapes",
      "#is-in-ci": path.resolve("${INK_DIR}/source/is-in-ci.ts"),
    },
  },
  test: {
    include: ["${INK_DIR}/test/**/*.tsx", "${INK_DIR}/test/**/*.ts"],
    exclude: ["**/helpers/**", "**/fixtures/**"],
    root: "${SILVERY_ROOT}",
    environment: "node",
    passWithNoTests: true,
    reporter: "verbose",
    // Some ink tests may use ava-style APIs — skip those gracefully
    typecheck: { enabled: false },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
})
`
	await Bun.write(configPath, config)

	try {
		const result =
			await $`cd ${SILVERY_ROOT} && bunx --bun vitest run --config ${configPath} 2>&1`.text()
		console.log(result)
		return result
	} catch (e: any) {
		// vitest exits non-zero when tests fail — that's expected
		const output = e.stdout?.toString() ?? e.message
		console.log(output)
		return output
	}
}

async function runChalkTests() {
	console.log("\n--- Chalk Compatibility ---\n")

	await cloneIfNeeded(CHALK_REPO, CHALK_DIR, "chalk")

	const configPath = join(CLONE_DIR, "vitest.config.chalk.ts")
	const config = `
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "chalk": path.resolve("${SILVERY_ROOT}/packages/compat/src/chalk.ts"),
    },
  },
  test: {
    include: ["${CHALK_DIR}/test/**/*.js", "${CHALK_DIR}/test/**/*.ts"],
    root: "${SILVERY_ROOT}",
    environment: "node",
    passWithNoTests: true,
    reporter: "verbose",
    typecheck: { enabled: false },
  },
})
`
	await Bun.write(configPath, config)

	try {
		const result =
			await $`cd ${SILVERY_ROOT} && bunx --bun vitest run --config ${configPath} 2>&1`.text()
		console.log(result)
		return result
	} catch (e: any) {
		const output = e.stdout?.toString() ?? e.message
		console.log(output)
		return output
	}
}

function parseSummary(output: string) {
	const passMatch = output.match(/(\d+) passed/)
	const failMatch = output.match(/(\d+) failed/)
	const skipMatch = output.match(/(\d+) skipped/)
	return {
		passed: passMatch ? Number(passMatch[1]) : 0,
		failed: failMatch ? Number(failMatch[1]) : 0,
		skipped: skipMatch ? Number(skipMatch[1]) : 0,
	}
}

// Main
console.log("silvery compat checker\n")
console.log("Cloning test suites (cached after first run)...")
await $`mkdir -p ${CLONE_DIR}`.quiet()

let inkResult = ""
let chalkResult = ""

if (!target || target === "ink") {
	inkResult = await runInkTests()
}
if (!target || target === "chalk") {
	chalkResult = await runChalkTests()
}

console.log("\n=== Summary ===\n")

if (inkResult) {
	const ink = parseSummary(inkResult)
	const total = ink.passed + ink.failed
	const pct = total > 0 ? ((ink.passed / total) * 100).toFixed(1) : "N/A"
	console.log(
		`Ink:   ${ink.passed} passed, ${ink.failed} failed, ${ink.skipped} skipped (${pct}% compat)`,
	)
}
if (chalkResult) {
	const chalk = parseSummary(chalkResult)
	const total = chalk.passed + chalk.failed
	const pct = total > 0 ? ((chalk.passed / total) * 100).toFixed(1) : "N/A"
	console.log(
		`Chalk: ${chalk.passed} passed, ${chalk.failed} failed, ${chalk.skipped} skipped (${pct}% compat)`,
	)
}
