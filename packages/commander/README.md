# @silvery/commander

Enhanced [Commander.js](https://github.com/tj/commander.js) with type-safe options, auto-colorized help, [Standard Schema](https://github.com/standard-schema/standard-schema) validation, and built-in CLI types.

Drop-in replacement -- `Command` is a subclass of Commander's `Command` with full type inference for options, arguments, and parsed values. Install once, Commander is included.

## Usage

```typescript
import { Command, port, csv } from "@silvery/commander"

new Command("deploy")
  .description("Deploy the application")
  .version("1.0.0")
  .option("-p, --port <n>", "Port", port)
  .option("--tags <t>", "Tags", csv)
  .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])

program.parse()
```

Help output is automatically colorized -- bold headings, green flags, cyan commands, dim descriptions, yellow arguments. Uses [Commander's](https://github.com/tj/commander.js) built-in `configureHelp()` style hooks.

Colorization works out of the box with raw ANSI codes. Install [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) for full terminal capability detection (respects `NO_COLOR`, `FORCE_COLOR`, and `isTTY`).

## Validated options with built-in types

Commander's `.option()` accepts a string and gives you a string back. Our built-in types parse and validate in one step:

```typescript
import { Command, port, csv, int } from "@silvery/commander"

new Command("deploy")
  .option("-p, --port <n>", "Port", port) // number (1-65535, validated)
  .option("--tags <t>", "Tags", csv) // string[]
  .option("-r, --retries <n>", "Retries", int) // number (integer)
  .option("-e, --env <e>", "Env", ["dev", "staging", "prod"]) // choices
```

These types are **not part of Commander** -- they're provided by `@silvery/commander`. Each implements [Standard Schema v1](https://github.com/standard-schema/standard-schema), so they work with any schema-aware tooling. They have zero dependencies.

### Available types

| Type    | Output     | Validation                               |
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
| `email` | `string`   | Basic email validation                   |
| `regex` | `RegExp`   | Valid regex pattern                      |

### Factory type

```typescript
import { intRange } from "@silvery/commander"

intRange(1, 100) // CLIType<number> -- integer within bounds
```

### Array choices

Pass an array as the third argument to restrict an option to a fixed set of values:

```typescript
.option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
```

Commander validates the choice at parse time and rejects invalid values.

### Standalone usage

Types work outside Commander too -- for validating env vars, config files, etc.:

```typescript
import { port, csv } from "@silvery/commander/parse"

port.parse("3000") // 3000
port.parse("abc") // throws: 'Expected port (1-65535), got "abc"'
port.safeParse("3000") // { success: true, value: 3000 }
port.safeParse("abc") // { success: false, issues: [{ message: "..." }] }
```

The `/parse` subpath has zero dependencies -- no Commander, no [Zod](https://github.com/colinhacks/zod).

## Standard Schema validation

Pass any [Standard Schema v1](https://github.com/standard-schema/standard-schema) schema as the third argument to `.option()`. This works with [Zod](https://github.com/colinhacks/zod) (>=3.24), [Valibot](https://github.com/fabian-hiller/valibot) (>=1.0), [ArkType](https://github.com/arktypeio/arktype) (>=2.0), and any library implementing the protocol:

```typescript
import { Command } from "@silvery/commander"
import { z } from "zod"

new Command("deploy")
  .option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
  .option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
  .option(
    "--tags <t>",
    "Tags",
    z.string().transform((v) => v.split(",")),
  )
```

Schema libraries are optional peer dependencies -- detected at runtime, never imported at the top level.

## Zod CLI types

Import `z` from `@silvery/commander` for [Zod](https://github.com/colinhacks/zod) extended with CLI-specific schemas:

```typescript
import { Command, z } from "@silvery/commander"

new Command("deploy")
  .option("-p, --port <n>", "Port", z.port)
  .option("--tags <t>", "Tags", z.csv)
  .option("-r, --retries <n>", "Retries", z.int)
  .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
```

The `z` export is tree-shakeable -- if you don't import it, [Zod](https://github.com/colinhacks/zod) won't be in your bundle. Requires `zod` as a peer dependency.

Available: `z.port`, `z.int`, `z.uint`, `z.float`, `z.csv`, `z.url`, `z.path`, `z.email`, `z.date`, `z.json`, `z.bool`, `z.intRange(min, max)`.

## Function parsers

[Commander's](https://github.com/tj/commander.js) standard parser function pattern also works:

```typescript
new Command("app")
  .option("-p, --port <n>", "Port", parseInt) // number
  .option("--tags <items>", "Tags", (v) => v.split(",")) // string[]
  .option("-p, --port <n>", "Port", parseInt, 8080) // number (with default)
```

## colorizeHelp()

Use standalone with a plain [Commander](https://github.com/tj/commander.js) `Command` (without subclassing):

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp")
colorizeHelp(program) // applies recursively to all subcommands
```

## Import paths

| Path                       | What                            | Dependencies                                    |
| -------------------------- | ------------------------------- | ----------------------------------------------- |
| `@silvery/commander`       | Command, colorizeHelp, types, z | [commander](https://github.com/tj/commander.js) |
| `@silvery/commander/parse` | Types only (.parse/.safeParse)  | none                                            |

## Beyond extra-typings

Built on the shoulders of [@commander-js/extra-typings](https://github.com/commander-js/extra-typings). We add:

- **Auto-colorized help** -- bold headings, green flags, cyan commands
- **Built-in validation** via [Standard Schema](https://github.com/standard-schema/standard-schema) -- works with [Zod](https://github.com/colinhacks/zod), [Valibot](https://github.com/fabian-hiller/valibot), [ArkType](https://github.com/arktypeio/arktype)
- **14 CLI types** -- `port`, `csv`, `int`, `url`, `email` and more, usable standalone via `.parse()`/`.safeParse()`
- **NO_COLOR support** via [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)
- **Commander included** -- one install, no peer dep setup

## Credits

- **[Commander.js](https://github.com/tj/commander.js)** by TJ Holowaychuk and contributors -- the underlying CLI framework
- **[@commander-js/extra-typings](https://github.com/commander-js/extra-typings)** -- inspired the type inference approach
- **[Standard Schema](https://github.com/standard-schema/standard-schema)** -- universal schema interop protocol
- **[@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi)** -- optional terminal capability detection

## License

MIT
