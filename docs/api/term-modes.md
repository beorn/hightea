# term.modes

Single authority for terminal protocol modes. Owns raw mode, alternate screen, bracketed paste, Kitty keyboard, mouse tracking, and focus reporting.

`term.modes` consolidates the previously-scattered `enableMouse()` / `enableKittyKeyboard()` / `enableBracketedPaste()` / `setRawMode(true)` calls into a single owner with idempotent setters and exact-inverse dispose.

## Shape

```ts
interface Modes extends Disposable {
  setRawMode(on: boolean): void
  setAlternateScreen(on: boolean): void
  setBracketedPaste(on: boolean): void
  setKittyKeyboard(flags: number | false): void
  setMouseEnabled(on: boolean): void
  setFocusReporting(on: boolean): void

  readonly isRawMode: boolean
  readonly isAlternateScreen: boolean
  readonly isBracketedPaste: boolean
  readonly kittyKeyboard: number | false
  readonly isMouseEnabled: boolean
  readonly isFocusReporting: boolean
}
```

## Access

```ts
using term = createTerm()
term.modes.setAlternateScreen(true)
term.modes.setRawMode(true)
```

`term.modes` is always present (including on headless and emulator-backed Terms — they receive a no-op owner so callers don't need to branch). Construction is free — no ANSI or termios toggle until the first `set*` call.

## Setters

All setters are **idempotent**: a call with the current value is a no-op. They track the last-written value in the owner's state; readers consult that state via the boolean/numeric getters.

### `setRawMode(on)`

Toggles stdin termios raw mode. Uses the stdin stream passed at construction (normally `process.stdin`).

- TTY stdin: calls `stdin.setRawMode(on)`.
- Non-TTY stdin: no-op on the stream; the getter still reflects the intent (useful for tests).

Prefer a single `setRawMode(true)` at session start. Do not capture-and-restore around async work — see [the `wasRaw` anti-pattern note](/guide/term#anti-patterns).

### `setAlternateScreen(on)`

Writes DEC private mode 1049 — enters the alternate screen buffer, hides the scrollback, and on restore brings the scrollback back:

- `true` → `CSI ? 1049 h`
- `false` → `CSI ? 1049 l`

### `setBracketedPaste(on)`

DEC private mode 2004 — the terminal wraps pasted text in `ESC [ 200 ~` / `ESC [ 201 ~`, letting the input parser treat paste as one event rather than synthetic keystrokes.

### `setKittyKeyboard(flags)`

Enables the [Kitty keyboard protocol](/guide/kitty-protocol) with a flags bitfield; `false` disables. The owner writes the matching `CSI > flags u` / `CSI < u` sequence from `@silvery/ansi`.

```ts
import { KittyFlags } from "@silvery/ag-term/runtime"

term.modes.setKittyKeyboard(
  KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS | KittyFlags.REPORT_TEXT,
)
```

| Flag                       | Bit | Meaning                                      |
| -------------------------- | --- | -------------------------------------------- |
| `KittyFlags.DISAMBIGUATE`  | 1   | Disambiguate escape codes                    |
| `KittyFlags.REPORT_EVENTS` | 2   | Report event types (press / repeat / release) |
| `KittyFlags.REPORT_ALTERNATE` | 4 | Report alternate keys                        |
| `KittyFlags.REPORT_ALL_KEYS` | 8 | Report all keys as escape codes             |
| `KittyFlags.REPORT_TEXT`   | 16  | Report associated text                       |

Passing `true` is shorthand for `DISAMBIGUATE` only; pass a numeric bitfield for richer modes.

### `setMouseEnabled(on)`

SGR mouse tracking — xterm modes 1003 (all motion + clicks) and 1006 (SGR encoding). Produces precise button + modifier reports.

### `setFocusReporting(on)`

DEC private mode 1004 — the terminal emits `ESC [ I` / `ESC [ O` when the window gains or loses focus, letting the app dim / brighten UI accordingly.

## Suspend / resume

The only legitimate mid-session toggle path is `SIGTSTP` (Ctrl+Z). Before suspending, call:

```ts
term.modes.setFocusReporting(false)
term.modes.setMouseEnabled(false)
term.modes.setKittyKeyboard(false)
term.modes.setBracketedPaste(false)
term.modes.setAlternateScreen(false)
term.modes.setRawMode(false)
```

…and on resume (`SIGCONT`), re-apply in reverse order. Because every toggle goes through the owner, its internal state stays consistent and dispose still restores correctly.

## `dispose()`

Restores **only** what this owner activated, in reverse order:

1. `disableFocusReporting`
2. `disableMouse`
3. `disableKittyKeyboard`
4. `disableBracketedPaste`
5. Leave alt screen
6. `setRawMode(false)` (stdin)

Modes that were never set stay untouched — this is important on shared stdin where a neighbouring owner may have them set intentionally. Idempotent.

## See also

- [term.input](/api/term-input) — coexists with raw mode but is the mediator for stdin data
- [term.output](/api/term-output) — writes ANSI on behalf of setters once Output is active
- [Kitty Protocol](/guide/kitty-protocol) — what the flags mean
- [Term — the I/O umbrella](/guide/term)
