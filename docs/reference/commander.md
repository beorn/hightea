# @silvery/commander

Enhanced [Commander.js](https://github.com/tj/commander.js) with auto-colorized help, [Standard Schema](https://github.com/standard-schema/standard-schema) validation, and CLI presets. Drop-in replacement -- `Command` is a subclass of Commander's `Command`.

## Installation

::: code-group

```bash [npm]
npm install @silvery/commander
```

```bash [bun]
bun add @silvery/commander
```

```bash [pnpm]
pnpm add @silvery/commander
```

```bash [yarn]
yarn add @silvery/commander
```

:::

## Three Usage Patterns

```typescript
// 1. Enhanced Commander (auto-colorized help, Standard Schema support)
import { Command, port, csv } from "@silvery/commander"

// 2. Standalone presets (zero-dep, Standard Schema, no Commander)
import { port, csv, int } from "@silvery/commander/parse"

// 3. Zod + CLI presets (batteries included)
import { Command, z } from "@silvery/commander"
```

## Usage

```typescript
import { Command, port, csv, oneOf } from "@silvery/commander"

const program = new Command("deploy")
  .description("Deploy the application")
  .version("1.0.0")
  .option("-p, --port <n>", "Port", port)                            // number (1-65535)
  .option("--tags <t>", "Tags", csv)                                 // string[]
  .option("-e, --env <e>", "Env", oneOf(["dev", "staging", "prod"])) // literal union

program.parse()
const opts = program.opts()
```

Help output is automatically colorized using Commander's built-in `configureHelp()` style hooks -- headings bold, flags green, commands cyan, descriptions dim, arguments yellow.

## `colorizeHelp()`

Apply colorized help to a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

## Standard Schema Validation

Pass any [Standard Schema v1](https://github.com/standard-schema/standard-schema) compatible schema as the third argument to `.option()`. Works with the built-in presets, Zod (>=3.24), Valibot (>=1.0), ArkType (>=2.0), and any other library implementing the standard:

```typescript
import { Command } from "@silvery/commander"
import { z } from "zod"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
  .option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
  .option("--tags <t>", "Tags", z.string().transform((v) => v.split(",")))
```

Schema libraries are optional peer dependencies -- detected at runtime via the Standard Schema `~standard` interface, never imported at the top level.

## Zod CLI Presets

Import `z` from `@silvery/commander` for an extended Zod object with CLI-specific schemas:

```typescript
import { Command, z } from "@silvery/commander"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", z.port)                        // z.coerce.number().int().min(1).max(65535)
  .option("--tags <t>", "Tags", z.csv)                             // z.string().transform(...)
  .option("-e, --env <e>", "Env", z.oneOf(["dev", "staging", "prod"]))
  .option("-r, --retries <n>", "Retries", z.int)                   // z.coerce.number().int()
```

The `z` export is tree-shakeable -- if you don't import it, Zod won't be in your bundle.

Available `z` CLI presets: `z.port`, `z.int`, `z.uint`, `z.float`, `z.csv`, `z.url`, `z.path`, `z.email`, `z.date`, `z.json`, `z.bool`, `z.intRange(min, max)`, `z.oneOf(values)`.

## Preset Reference

Pre-built validators for common CLI argument patterns. Each preset implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) and works with Commander's `.option()` or standalone.

| Preset  | Type       | Validation                               |
| ------- | ---------- | ---------------------------------------- |
| `int`   | `number`   | Integer (coerced from string)            |
| `uint`  | `number`   | Unsigned integer (>= 0)                  |
| `float` | `number`   | Any finite number (rejects NaN)          |
| `port`  | `number`   | Integer 1-65535                          |
| `url`   | `string`   | Valid URL (via `URL` constructor)        |
| `path`  | `string`   | Non-empty string                         |
| `csv`   | `string[]` | Comma-separated, trimmed, empty filtered |
| `json`  | `unknown`  | Parsed JSON                              |
| `bool`  | `boolean`  | true/false/yes/no/1/0 (case-insensitive) |
| `date`  | `Date`     | Valid date string                        |
| `email` | `string`   | Basic email validation (has @ and .)     |
| `regex` | `RegExp`   | Valid regex pattern                      |

### Factory Presets

```typescript
import { intRange, oneOf } from "@silvery/commander"

intRange(1, 100)          // Preset<number> -- integer within bounds
oneOf(["a", "b", "c"])    // Preset<"a" | "b" | "c"> -- enum from values
```

### Standalone Usage

Presets also work outside Commander for validating env vars, config files, etc. Import from `@silvery/commander/parse` for tree-shaking:

```typescript
import { port, csv, oneOf } from "@silvery/commander/parse"

// .parse() -- returns value or throws
const dbPort = port.parse(process.env.DB_PORT ?? "5432")

// .safeParse() -- returns result object, never throws
const result = port.safeParse("abc")
// { success: false, issues: [{ message: 'Expected port (1-65535), got "abc"' }] }

// Standard Schema ~standard.validate() also available
const validated = port["~standard"].validate("8080")
// { value: 8080 }
```

## Parser Type Inference

When `.option()` is called with a parser function as the third argument, Commander infers the return type:

```typescript
const program = new Command("deploy")
  .option("-p, --port <n>", "Port", parseInt)                     // port: number
  .option("-t, --timeout <ms>", "Timeout", Number)                // timeout: number
  .option("--tags <items>", "Tags", (v) => v.split(","))          // tags: string[]
```

Default values can be passed as the fourth argument:

```typescript
.option("-p, --port <n>", "Port", parseInt, 8080)  // port: number (defaults to 8080)
```

## Comparison with @commander-js/extra-typings

`@silvery/commander` is a superset. It re-exports Commander's `Command` as a subclass with:

- **Auto-colorized help** -- no manual formatting, respects `NO_COLOR`/`FORCE_COLOR`
- **Standard Schema validation** -- pass Zod/Valibot/ArkType schemas directly to `.option()`
- **Built-in presets** -- `port`, `csv`, `int`, `url`, etc. with Standard Schema compliance
- **Zod CLI presets** -- extended `z` with `z.port`, `z.csv`, `z.oneOf()`, etc.
- **Standalone usage** -- presets work outside Commander via `@silvery/commander/parse`

If you're using `@commander-js/extra-typings` today, switching is a one-line import change.
