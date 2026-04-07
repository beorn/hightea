/**
 * Shell command-line tokenizer for help-section term styling.
 *
 * Walks a single line of shell-like text and classifies each token so the
 * default text help renderer can style it without re-running the regex
 * machinery on every render. Pure function — no ANSI, no styling.
 *
 * Internal: not exported from index.ts. Used only by command.ts's
 * styleSectionTerm() / _renderSections().
 *
 * Example:
 *   tokenizeCmdline("$ termless play -o demo.gif demo.tape")
 *   →
 *   [
 *     { kind: "prompt",     text: "$ " },
 *     { kind: "program",    text: "termless" },
 *     { kind: "whitespace", text: " " },
 *     { kind: "subcommand", text: "play" },
 *     { kind: "whitespace", text: " " },
 *     { kind: "flag",       text: "-o" },
 *     { kind: "whitespace", text: " " },
 *     { kind: "value",      text: "demo.gif" },
 *     { kind: "whitespace", text: " " },
 *     { kind: "value",      text: "demo.tape" },
 *   ]
 */

export type CmdlineToken =
  | { kind: "prompt"; text: string }
  | { kind: "program"; text: string }
  | { kind: "subcommand"; text: string }
  | { kind: "flag"; text: string }
  | { kind: "arg-bracket"; text: string }
  | { kind: "quoted"; text: string }
  | { kind: "value"; text: string }
  | { kind: "whitespace"; text: string }

/** Detect a shell prompt at the start of a line. Supports `$ `, `# `, `> `, `❯ `. */
const PROMPT_RE = /^([$#>❯]\s+)/

/** Match one of: long/short flag, bracket arg, quoted string, bare token, whitespace. */
const TOKEN_RE = /(--?\S+)|(<[^>]+>|\[[^\]]+\])|('[^']*'|"[^"]*")|(\S+)|(\s+)/g

/** Bare command-word pattern (letters/digits/dash, no dots or slashes). */
const BARE_WORD_RE = /^[a-z][\w-]*$/i

/**
 * Tokenize a single line of shell-like text.
 *
 * Classification (matches the original styleSectionTerm contract):
 * - First non-whitespace bare word after the prompt is `program`.
 * - The IMMEDIATELY-FOLLOWING bare word (the second bare word) is `subcommand`,
 *   IF it looks like a command word (lowercase letter start, no dots/slashes).
 * - All subsequent bare words are `value`s (filenames, package names, etc.).
 * - Flags (`--foo`, `-f`), bracket args (`<x>`, `[y]`), and quoted strings end
 *   the "command portion" — anything after them is a value.
 *
 * The "max 1 subcommand" rule keeps `$ npm install foo` correctly classified
 * as program/subcommand/value (not program/subcommand/subcommand). For nested
 * commands (`$ git remote add ...`), only the first subcommand level is styled.
 *
 * If the line has no shell prompt, the same classification still applies —
 * the leading word is `program`, etc.
 */
export function tokenizeCmdline(line: string): CmdlineToken[] {
  const tokens: CmdlineToken[] = []

  // Detect and emit the prompt as a separate token
  const promptMatch = line.match(PROMPT_RE)
  let body = line
  if (promptMatch) {
    tokens.push({ kind: "prompt", text: promptMatch[1]! })
    body = line.slice(promptMatch[1]!.length)
  }

  // Tokenize the rest with contextual classification
  const matches = body.match(TOKEN_RE) ?? []
  let commandWords = 0
  let doneWithCommand = false

  for (const token of matches) {
    if (/^\s+$/.test(token)) {
      tokens.push({ kind: "whitespace", text: token })
      continue
    }
    if (/^--?\S/.test(token)) {
      doneWithCommand = true
      tokens.push({ kind: "flag", text: token })
      continue
    }
    if (/^[<[]/.test(token)) {
      doneWithCommand = true
      tokens.push({ kind: "arg-bracket", text: token })
      continue
    }
    if (/^["']/.test(token)) {
      doneWithCommand = true
      tokens.push({ kind: "quoted", text: token })
      continue
    }
    // Bare word: the first becomes `program`, the second (if it looks like a
    // command word — bare lowercase word, no dots/slashes) becomes `subcommand`,
    // and everything else becomes `value`.
    if (!doneWithCommand && commandWords === 0) {
      commandWords++
      tokens.push({ kind: "program", text: token })
      continue
    }
    if (!doneWithCommand && commandWords === 1 && BARE_WORD_RE.test(token)) {
      commandWords++
      tokens.push({ kind: "subcommand", text: token })
      continue
    }
    // Plain values (filenames, version strings, package names, anything else)
    doneWithCommand = true
    tokens.push({ kind: "value", text: token })
  }

  return tokens
}

/** Returns true if the line starts with a recognized shell prompt. */
export function isShellLine(line: string): boolean {
  return PROMPT_RE.test(line)
}
