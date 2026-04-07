/**
 * Tokenizer for shell command lines (used by the default text help renderer).
 *
 * Pure-function tests — table-driven, no Commander or rendering involved.
 */

import { describe, it, expect } from "vitest"
import { tokenizeCmdline, isShellLine, type CmdlineToken } from "../src/tokenize.ts"

describe("isShellLine", () => {
  it.each([
    ["$ npm install foo", true],
    ["# rm -rf /", true],
    ["> ls -la", true],
    ["❯ git status", true],
    ["npm install foo", false],
    ["", false],
    ["   $ leading-space", false],
    ["$without-space", false],
  ])("%s → %s", (line, expected) => {
    expect(isShellLine(line)).toBe(expected)
  })
})

describe("tokenizeCmdline", () => {
  // Helper: extract just the (kind, text) tuples for compact assertions
  const kt = (tokens: CmdlineToken[]) => tokens.map((t) => [t.kind, t.text])

  it("plain shell line: program + subcommand + value (third bare word becomes value)", () => {
    expect(kt(tokenizeCmdline("$ npm install foo"))).toEqual([
      ["prompt", "$ "],
      ["program", "npm"],
      ["whitespace", " "],
      ["subcommand", "install"],
      ["whitespace", " "],
      // foo is the 3rd bare word — values, not a subcommand (matches original
      // styleSectionTerm contract: only one subcommand level is styled)
      ["value", "foo"],
    ])
  })

  it("identifies long flags", () => {
    expect(kt(tokenizeCmdline("$ termless play --output demo.gif"))).toEqual([
      ["prompt", "$ "],
      ["program", "termless"],
      ["whitespace", " "],
      ["subcommand", "play"],
      ["whitespace", " "],
      ["flag", "--output"],
      ["whitespace", " "],
      ["value", "demo.gif"],
    ])
  })

  it("identifies short flags", () => {
    expect(kt(tokenizeCmdline("$ termless play -o demo.gif"))).toEqual([
      ["prompt", "$ "],
      ["program", "termless"],
      ["whitespace", " "],
      ["subcommand", "play"],
      ["whitespace", " "],
      ["flag", "-o"],
      ["whitespace", " "],
      ["value", "demo.gif"],
    ])
  })

  it("identifies bracket arguments", () => {
    expect(kt(tokenizeCmdline("$ deploy <service> [env]"))).toEqual([
      ["prompt", "$ "],
      ["program", "deploy"],
      ["whitespace", " "],
      ["arg-bracket", "<service>"],
      ["whitespace", " "],
      ["arg-bracket", "[env]"],
    ])
  })

  it("identifies quoted strings", () => {
    expect(kt(tokenizeCmdline('$ git commit -m "fix bug"'))).toEqual([
      ["prompt", "$ "],
      ["program", "git"],
      ["whitespace", " "],
      ["subcommand", "commit"],
      ["whitespace", " "],
      ["flag", "-m"],
      ["whitespace", " "],
      ["quoted", '"fix bug"'],
    ])
  })

  it("identifies single-quoted strings", () => {
    expect(kt(tokenizeCmdline("$ echo 'hello world'"))).toEqual([
      ["prompt", "$ "],
      ["program", "echo"],
      ["whitespace", " "],
      ["quoted", "'hello world'"],
    ])
  })

  it("treats words after flags as values, not subcommands", () => {
    // Once a flag appears, doneWithCommand is set — even bare words become values
    expect(kt(tokenizeCmdline("$ npm --silent install foo"))).toEqual([
      ["prompt", "$ "],
      ["program", "npm"],
      ["whitespace", " "],
      ["flag", "--silent"],
      ["whitespace", " "],
      ["value", "install"],
      ["whitespace", " "],
      ["value", "foo"],
    ])
  })

  it("words with dots are values, not subcommands (filenames)", () => {
    expect(kt(tokenizeCmdline("$ termless play demo.tape"))).toEqual([
      ["prompt", "$ "],
      ["program", "termless"],
      ["whitespace", " "],
      ["subcommand", "play"],
      ["whitespace", " "],
      ["value", "demo.tape"],
    ])
  })

  it("supports # prompt (root)", () => {
    expect(kt(tokenizeCmdline("# rm -rf /"))).toEqual([
      ["prompt", "# "],
      ["program", "rm"],
      ["whitespace", " "],
      ["flag", "-rf"],
      ["whitespace", " "],
      ["value", "/"],
    ])
  })

  it("supports ❯ prompt (fish)", () => {
    expect(kt(tokenizeCmdline("❯ ls -la"))).toEqual([
      ["prompt", "❯ "],
      ["program", "ls"],
      ["whitespace", " "],
      ["flag", "-la"],
    ])
  })

  it("lines without prompt still tokenize (no prompt token)", () => {
    expect(kt(tokenizeCmdline("npm install foo"))).toEqual([
      ["program", "npm"],
      ["whitespace", " "],
      ["subcommand", "install"],
      ["whitespace", " "],
      // 3rd bare word → value (max 1 subcommand level)
      ["value", "foo"],
    ])
  })

  it("empty line returns no tokens", () => {
    expect(kt(tokenizeCmdline(""))).toEqual([])
  })

  it("nested subcommands: only the second word is styled as subcommand", () => {
    // The original styleSectionTerm contract: max 1 subcommand level. Anything
    // beyond the second bare word is a value, even if semantically it's a deeper
    // subcommand. For nested commands like `git remote add`, "remote" is the
    // single styled subcommand and "add"/"origin"/"url" are values.
    expect(kt(tokenizeCmdline("$ git remote add origin url"))).toEqual([
      ["prompt", "$ "],
      ["program", "git"],
      ["whitespace", " "],
      ["subcommand", "remote"],
      ["whitespace", " "],
      ["value", "add"],
      ["whitespace", " "],
      ["value", "origin"],
      ["whitespace", " "],
      ["value", "url"],
    ])
  })

  it("flag with bundled value (--key=value as one token)", () => {
    expect(kt(tokenizeCmdline("$ run --port=3000"))).toEqual([
      ["prompt", "$ "],
      ["program", "run"],
      ["whitespace", " "],
      ["flag", "--port=3000"],
    ])
  })
})
