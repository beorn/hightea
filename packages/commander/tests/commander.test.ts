import { Command } from "commander"
import { describe, expect, it } from "vitest"
import { colorizeHelp } from "../src/index.ts"

// ANSI escape code constants matching the implementation defaults
const ESC = "\x1b["
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`
const CYAN = `${ESC}36m`
const GREEN = `${ESC}32m`
const YELLOW = `${ESC}33m`
const RED = `${ESC}31m`

function createTestProgram(): InstanceType<typeof Command> {
  return new Command("myapp")
    .description("A test CLI application")
    .version("1.0.0")
    .option("-v, --verbose", "Enable verbose output")
    .option("-o, --output <path>", "Output file path")
    .option("-c, --config [file]", "Config file")
    .argument("<input>", "Input file to process")
}

function addSubcommands(program: InstanceType<typeof Command>): void {
  program
    .command("build")
    .description("Build the project")
    .option("-w, --watch", "Watch mode")
    .option("--target <platform>", "Target platform")

  program.command("serve").description("Start dev server").option("-p, --port <number>", "Port number")
}

describe("colorizeHelp", () => {
  it("should not have ANSI codes without colorization", () => {
    const program = createTestProgram()
    const help = program.helpInformation()
    expect(help).not.toContain(ESC)
  })

  it("should add ANSI codes to help output", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(ESC)
  })

  it("should colorize section headings with bold", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Usage:${RESET}`)
    expect(help).toContain(`${BOLD}Options:${RESET}`)
    expect(help).toContain(`${BOLD}Arguments:${RESET}`)
  })

  it("should colorize the command name with cyan", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${CYAN}myapp${RESET}`)
  })

  it("should colorize option flags with green", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // Option terms are wrapped in green via styleOptionText
    expect(help).toContain(`${GREEN}-v, --verbose${RESET}`)
    expect(help).toContain(`${GREEN}-V, --version${RESET}`)
    expect(help).toContain(`${GREEN}-h, --help${RESET}`)
    // Options with arguments include the arg in the green wrapping
    expect(help).toContain(`${GREEN}-o, --output <path>${RESET}`)
  })

  it("should colorize descriptions with dim", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${DIM}Enable verbose output${RESET}`)
    expect(help).toContain(`${DIM}Output file path${RESET}`)
    expect(help).toContain(`${DIM}Config file${RESET}`)
  })

  it("should colorize argument terms with yellow via styleArgumentText", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // <input> in the usage line is colorized as an argument
    expect(help).toContain(`${YELLOW}<input>${RESET}`)
    // The argument term "input" in the Arguments section
    expect(help).toContain(`${YELLOW}input${RESET}`)
  })

  it("should colorize [options] in usage line with green (option text)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // Commander's default styleUsage delegates [options] to styleOptionText
    expect(help).toContain(`${GREEN}[options]${RESET}`)
  })

  it("should keep command description unstyled", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // The program description should appear but NOT be wrapped in DIM
    expect(help).toContain("A test CLI application")
    expect(help).not.toContain(`${DIM}A test CLI application${RESET}`)
  })

  it("should apply recursively to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    colorizeHelp(program)

    // Parent help has colorized subcommand list
    const parentHelp = program.helpInformation()
    expect(parentHelp).toContain(`${BOLD}Commands:${RESET}`)
    expect(parentHelp).toContain(CYAN) // subcommand names in cyan

    // Subcommand help is also colorized
    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    expect(buildHelp).toContain(`${BOLD}Usage:${RESET}`)
    expect(buildHelp).toContain(`${BOLD}Options:${RESET}`)
    expect(buildHelp).toContain(`${GREEN}-w, --watch${RESET}`)
    expect(buildHelp).toContain(`${DIM}Watch mode${RESET}`)
    expect(buildHelp).toContain(`${DIM}Target platform${RESET}`)
  })

  it("should accept custom color options", () => {
    const program = createTestProgram()
    colorizeHelp(program, {
      commands: RED,
      flags: YELLOW,
      description: CYAN,
      heading: DIM,
      brackets: GREEN,
    })
    const help = program.helpInformation()

    // Headings use custom DIM instead of default BOLD
    expect(help).toContain(`${DIM}Usage:${RESET}`)
    expect(help).toContain(`${DIM}Options:${RESET}`)

    // Command name uses RED instead of default CYAN
    expect(help).toContain(`${RED}myapp${RESET}`)

    // Descriptions use CYAN instead of default DIM
    expect(help).toContain(`${CYAN}Enable verbose output${RESET}`)

    // Arguments use GREEN instead of default YELLOW
    expect(help).toContain(`${GREEN}<input>${RESET}`)

    // Flags use YELLOW instead of default GREEN
    expect(help).toContain(`${YELLOW}-v, --verbose${RESET}`)
  })

  it("should handle program with no options or subcommands", () => {
    const program = new Command("bare").description("Minimal program")
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Usage:${RESET}`)
    expect(help).toContain(`${CYAN}bare${RESET}`)
  })

  it("should propagate custom colors to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    colorizeHelp(program, { flags: RED })

    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    // Subcommand options use the custom RED for flags
    expect(buildHelp).toContain(`${RED}-w, --watch${RESET}`)
  })
})
