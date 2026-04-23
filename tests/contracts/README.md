# Defaults contract tests

These tests mechanically verify every **documented default** in silvery's public
API. The shape of the bugs they catch is always the same:

1. A public option has a `@default` or `Default:` docstring.
2. Code implements the opposite (e.g. `selection ?? false` when docs say default is
   `true when mouse is enabled`).
3. Every existing test passes the option explicitly, so the default branch is
   never exercised.
4. The bug ships.

Each file in this directory pins the defaults for one public entry point by
**omitting the option** and asserting behavior matches the docstring.

## Naming convention

Every test name starts with `contract:` and names the contract, not the bug
that seeded it:

- `contract: selection defaults to true when mouse: true is passed`
- `contract: detectTerminalCaps honors FORCE_COLOR=3`
- `contract: mouseDown+Up without movement produces null range`

## File placement

`tests/contracts/<entry-point>-defaults.contract.test.tsx`

- `run-defaults.contract.test.tsx` — `run(element, term, options?)`
- `create-app-defaults.contract.test.tsx` — `createApp()` + `.run()`
- `render-defaults.contract.test.tsx` — `render()` (lower-level)
- `create-termless-defaults.contract.test.tsx` — `createTermless()` test harness
- `create-term-defaults.contract.test.tsx` — `createTerm()` live terminal

## When adding a new option

If your PR adds a public option with a `@default` docstring, it MUST include a
contract test in the same PR that omits the option and asserts the documented
default. No exceptions — without the test, the docstring is a lie waiting to
happen (see Phase 1 bugs: `selectionEnabled ?? false`, `detectTerminalCaps`
ignoring FORCE_COLOR, mouse drag state machine).

Seed the new test in the file matching the entry point where the option is
consumed. If you are introducing a new public entry point, create a new
contracts file for it.
