/**
 * silvery/chalk — Drop-in chalk replacement powered by @silvery/style.
 *
 * ```ts
 * // Before:
 * import chalk from 'chalk'
 *
 * // After:
 * import chalk from 'silvery/chalk'
 * ```
 *
 * The default export is a chainable styling function with chalk-compatible API.
 * Under the hood it uses @silvery/style — no chalk dependency.
 *
 * @packageDocumentation
 */

import { createStyle, type Style } from "@silvery/style"
import { detectColor } from "@silvery/ag-term/ansi/detection"
import type { ColorLevel } from "@silvery/ag-term/ansi/types"

// =============================================================================
// Color level conversion (chalk uses 0-3, silvery uses string|null)
// =============================================================================

type ChalkLevel = 0 | 1 | 2 | 3

function toChalkLevel(cl: ColorLevel | null): ChalkLevel {
  if (cl === null) return 0
  if (cl === "basic") return 1
  if (cl === "256") return 2
  return 3 // truecolor
}

function fromChalkLevel(level: ChalkLevel): ColorLevel | null {
  if (level === 0) return null
  if (level === 1) return "basic"
  if (level === 2) return "256"
  return "truecolor"
}

// =============================================================================
// Default instance (auto-detected)
// =============================================================================

const detectedColor =
  typeof process !== "undefined" && process.stdout ? detectColor(process.stdout) : null

/**
 * Default chalk instance — drop-in replacement for `import chalk from 'chalk'`.
 *
 * Supports the full chainable API: `chalk.bold.red('error')`, `chalk.hex('#ff0')('hi')`, etc.
 * Also supports mutable `chalk.level` for chalk compat (0=none, 1=basic, 2=256, 3=truecolor).
 */
const chalk: Style = createStyle({ level: detectedColor })
export default chalk

// =============================================================================
// Named exports (chalk 5.x compatibility)
// =============================================================================

/**
 * Chalk constructor — creates a new style instance with a specific level.
 *
 * ```ts
 * const instance = new Chalk({ level: 3 })
 * console.log(instance.red('error'))
 * ```
 */
export class Chalk {
  #style: Style

  constructor(options?: { level?: ChalkLevel }) {
    this.#style = createStyle({ level: fromChalkLevel(options?.level ?? toChalkLevel(detectedColor)) })
  }

  get level(): ChalkLevel {
    return this.#style.level as ChalkLevel
  }

  set level(n: ChalkLevel) {
    this.#style.level = n
  }

  // Make instances callable — Chalk("text") applies styles
  [Symbol.toPrimitive](_hint: string): string {
    return ""
  }
}

// Create a Proxy around Chalk instances to make them callable + chainable
const ChalkHandler: ProxyHandler<Chalk> = {
  apply(target, _thisArg, args) {
    return (target as unknown as Style)(args[0] as string)
  },
  get(target, prop) {
    if (prop === "level") return (target as any).level
    const style = (target as any)["#style"] ?? createStyle({ level: fromChalkLevel((target as any).level ?? 0) })
    const val = (style as any)[prop]
    return val
  },
  set(target, prop, value) {
    if (prop === "level") {
      (target as any).level = value
      return true
    }
    return false
  },
}

export type ChalkInstance = Style

/**
 * Color support detection for stdout.
 * Returns false if no color, or an object with the chalk level.
 */
const detectedLevel = toChalkLevel(detectedColor)
export const supportsColor: false | { level: ChalkLevel } = detectedLevel === 0 ? false : { level: detectedLevel }

/**
 * Color support detection for stderr.
 */
export const supportsColorStderr: false | { level: ChalkLevel } = (() => {
  if (!process?.stderr) return false
  const level = toChalkLevel(detectColor(process.stderr))
  return level === 0 ? false : { level }
})()

// =============================================================================
// Chalk name lists (for programmatic access)
// =============================================================================

export const modifierNames = [
  "reset",
  "bold",
  "dim",
  "italic",
  "underline",
  "overline",
  "inverse",
  "hidden",
  "strikethrough",
  "visible",
] as const

export const foregroundColorNames = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "grey",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
] as const

export const backgroundColorNames = [
  "bgBlack",
  "bgRed",
  "bgGreen",
  "bgYellow",
  "bgBlue",
  "bgMagenta",
  "bgCyan",
  "bgWhite",
  "bgGray",
  "bgGrey",
  "bgBlackBright",
  "bgRedBright",
  "bgGreenBright",
  "bgYellowBright",
  "bgBlueBright",
  "bgMagentaBright",
  "bgCyanBright",
  "bgWhiteBright",
] as const

export const colorNames = [...foregroundColorNames, ...backgroundColorNames] as const

// Re-export detection utilities that chalk users often need
export { detectColor, toChalkLevel, fromChalkLevel }
export type { ColorLevel, ChalkLevel }
