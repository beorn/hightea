/**
 * Diagnostic test: verify that boxes in the static-scrollback example
 * do not exceed the terminal width (80 columns).
 *
 * Reproduces the structure from ExchangeView in static-scrollback.tsx:
 * - Root Box (column, overflow=hidden)
 *   - ExchangeView Box (column, borderStyle=round, paddingX=1)
 *     - Text content
 *     - ToolCallBlock Box (column)
 *       - Text header
 *       - Box (borderStyle=bold, borderLeft only, paddingLeft=1)
 *         - Text lines
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "@hightea/term/testing"
import { renderStringSync } from "../src/render-string.js"

// stripAnsi to measure visible width — strips ALL ANSI escape sequences and control chars
function stripAnsi(str: string): string {
  return (
    str
      // SGR sequences: \x1b[...m
      .replace(/\x1b\[[0-9;]*m/g, "")
      // CSI sequences: \x1b[...letter (covers \x1b[K, \x1b[2J, \x1b[H, cursor moves, etc.)
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      // Cursor visibility: \x1b[?25h and \x1b[?25l
      .replace(/\x1b\[\?[0-9;]*[a-z]/g, "")
      // OSC sequences: \x1b]...BEL or \x1b]...\x1b\\
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      // Any remaining ESC sequences
      .replace(/\x1b[^[]\S*/g, "")
      // Control characters: \r (carriage return), \b (backspace), etc.
      // These are zero-width terminal control chars, not visible content.
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\r]/g, "")
  )
}

/** Measure visible width of a line (counting wide chars as 2) */
function visibleWidth(line: string): number {
  const stripped = stripAnsi(line)
  let width = 0
  for (const char of stripped) {
    const cp = char.codePointAt(0) ?? 0
    // CJK wide chars and fullwidth forms
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3040 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x2fffd) ||
      (cp >= 0x30000 && cp <= 0x3fffd)
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

describe("scrollback width: boxes must not exceed terminal width", () => {
  const COLS = 80
  const ROWS = 24

  test("ExchangeView with tool calls fits within 80 columns", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Simplified ExchangeView structure from static-scrollback.tsx
    function ToolCallBlock({ tool, args, output }: { tool: string; args: string; output: string[] }) {
      return (
        <Box flexDirection="column" marginTop={0}>
          <Text>
            <Text color="blue" bold>
              {tool}
            </Text>
            <Text dim> {args}</Text>
          </Text>
          <Box
            flexDirection="column"
            borderStyle="bold"
            borderColor="blue"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
          >
            {output.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    function ExchangeView() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text> </Text>
          <Text>Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.</Text>
          <Box flexDirection="column" marginTop={1}>
            <ToolCallBlock
              tool="Edit"
              args="src/auth.ts"
              output={[
                "  const decoded = jwt.decode(token)",
                "- if (decoded.exp < Date.now()) {",
                '-   throw new Error("Token expired")',
                "+ if (decoded.exp < Date.now() / 1000) {",
                "+   return refreshToken(token)",
                "  }",
              ]}
            />
          </Box>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column" gap={1} overflow="hidden">
        <ExchangeView />
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    // Check every line fits within 80 columns
    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const width = visibleWidth(lines[i]!)
      if (width > COLS) {
        violations.push(`Line ${i} has width ${width} > ${COLS}: "${lines[i]}"`)
      }
    }

    expect(violations, `Lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)
  })

  test("root Box constrains children to terminal width (no explicit width)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Even without explicit width="100%", the root Box should be constrained
    // to the terminal width by the layout engine
    const app = render(
      <Box flexDirection="column">
        <Box borderStyle="round" paddingX={1}>
          <Text>{"A".repeat(100)}</Text>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const width = visibleWidth(lines[i]!)
      expect(width, `Line ${i} has width ${width}, expected <= ${COLS}: "${lines[i]}"`).toBeLessThanOrEqual(COLS)
    }
  })

  test("nested border boxes respect parent width constraint", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Nested structure: outer border + inner border-left + paddingLeft
    // Total border/padding overhead:
    //   outer round border: 2 cols (left+right)
    //   outer paddingX=1: 2 cols
    //   inner bold borderLeft: 1 col
    //   inner paddingLeft=1: 1 col
    //   Total: 6 cols -> content should fit in 74 cols
    const app = render(
      <Box flexDirection="column" overflow="hidden">
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box
            flexDirection="column"
            borderStyle="bold"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
          >
            <Text>{"B".repeat(100)}</Text>
          </Box>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const width = visibleWidth(lines[i]!)
      expect(width, `Line ${i} has width ${width}, expected <= ${COLS}: "${lines[i]}"`).toBeLessThanOrEqual(COLS)
    }

    // Check that the border-left structure is visible
    expect(text).toContain("┃") // bold left border character
  })

  test("renderStringSync output also fits within specified width", () => {
    // This tests the same path that useScrollback uses for scrollback rendering
    function ExchangeContent() {
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dim>Working on a fix...</Text>
          <Box flexDirection="column">
            <Text dim>
              <Text color="yellow" bold>
                {"▸ "}Edit
              </Text>
              <Text> src/auth.ts</Text>
            </Text>
            <Box flexDirection="column" paddingLeft={4}>
              <Text dim>{"  const decoded = jwt.decode(token)"}</Text>
              <Text dim>{"- if (decoded.exp < Date.now()) {"}</Text>
              <Text dim>{'-   throw new Error("Token expired")'}</Text>
              <Text dim>{"+ if (decoded.exp < Date.now() / 1000) {"}</Text>
              <Text dim>{"+   return refreshToken(token)"}</Text>
              <Text dim>{"  }"}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const output = renderStringSync(<ExchangeContent />, { width: COLS })
    const lines = output.split("\n")

    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const stripped = stripAnsi(lines[i]!)
      const width = visibleWidth(lines[i]!)
      if (width > COLS) {
        violations.push(`Line ${i} has visible width ${width} > ${COLS}: "${stripped}"`)
      }
    }

    expect(violations, `Lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)
  })

  test("ExchangeView bounding box does not exceed terminal width", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function ToolCallBlock({ tool, args, output }: { tool: string; args: string; output: string[] }) {
      return (
        <Box flexDirection="column" marginTop={0} testID="toolcall">
          <Text>
            <Text color="blue" bold>
              {tool}
            </Text>
            <Text dim> {args}</Text>
          </Text>
          <Box
            flexDirection="column"
            borderStyle="bold"
            borderColor="blue"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
            testID="tooloutput"
          >
            {output.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    function ExchangeView() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} testID="exchange">
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text> </Text>
          <Text>Found it. Fixing now.</Text>
          <Box flexDirection="column" marginTop={1}>
            <ToolCallBlock
              tool="Edit"
              args="src/auth.ts"
              output={[
                "  const decoded = jwt.decode(token)",
                "- if (decoded.exp < Date.now()) {",
                '-   throw new Error("Token expired")',
                "+ if (decoded.exp < Date.now() / 1000) {",
                "+   return refreshToken(token)",
                "  }",
              ]}
            />
          </Box>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column" gap={1} overflow="hidden">
        <ExchangeView />
      </Box>,
    )

    // Check bounding boxes
    const exchangeBox = app.getByTestId("exchange").boundingBox()!
    const toolOutputBox = app.getByTestId("tooloutput").boundingBox()!

    expect(exchangeBox.width, `ExchangeView width ${exchangeBox.width} exceeds ${COLS}`).toBeLessThanOrEqual(COLS)
    expect(
      exchangeBox.x + exchangeBox.width,
      `ExchangeView right edge ${exchangeBox.x + exchangeBox.width} exceeds ${COLS}`,
    ).toBeLessThanOrEqual(COLS)

    expect(
      toolOutputBox.x + toolOutputBox.width,
      `ToolOutput right edge ${toolOutputBox.x + toolOutputBox.width} exceeds ${COLS}`,
    ).toBeLessThanOrEqual(COLS)
  })

  test("bufferToStyledText output lines do not exceed width", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function ExchangeView() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text> </Text>
          <Text>Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.</Text>
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="column" marginTop={0}>
              <Text>
                <Text color="yellow" bold>
                  Edit
                </Text>
                <Text dim> src/auth.ts</Text>
              </Text>
              <Box
                flexDirection="column"
                borderStyle="bold"
                borderColor="yellow"
                borderLeft
                borderRight={false}
                borderTop={false}
                borderBottom={false}
                paddingLeft={1}
              >
                <Text>{"  const decoded = jwt.decode(token)"}</Text>
                <Text>{"- if (decoded.exp < Date.now()) {"}</Text>
                <Text>{'-   throw new Error("Token expired")'}</Text>
                <Text>{"+ if (decoded.exp < Date.now() / 1000) {"}</Text>
                <Text>{"+   return refreshToken(token)"}</Text>
                <Text>{"  }"}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column" gap={1} overflow="hidden">
        <ExchangeView />
      </Box>,
    )

    // Check the ANSI output (bufferToStyledText path)
    const ansiOutput = app.ansi
    const ansiLines = ansiOutput.split("\n")

    const violations: string[] = []
    for (let i = 0; i < ansiLines.length; i++) {
      const stripped = stripAnsi(ansiLines[i]!)
      const width = visibleWidth(stripped)
      if (width > COLS) {
        violations.push(`ANSI line ${i} has visible width ${width} > ${COLS}: "${stripped}"`)
      }
    }

    expect(violations, `ANSI lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)

    // Also check buffer dimensions directly
    const buffer = app.lastBuffer()!
    expect(buffer.width, "Buffer width should be <= terminal columns").toBeLessThanOrEqual(COLS)
  })

  test("renderStringSync output for ScrollbackExchange does not exceed width", () => {
    // This mirrors exactly what useScrollback renders for frozen exchanges.
    // The ScrollbackExchange component uses paddingLeft/paddingX, not borders.
    function ScrollbackExchange() {
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dim>Let me look at the auth module.</Text>
          <Box flexDirection="column">
            <Text dim>
              <Text color="blue" bold>
                {"▸ "}Read
              </Text>
              <Text> src/auth.ts</Text>
            </Text>
            <Box flexDirection="column" paddingLeft={4}>
              <Text dim>export async function login(token: string) {"{"}</Text>
              <Text dim> const decoded = jwt.decode(token)</Text>
              <Text dim>
                {" "}
                if (decoded.exp {"<"} Date.now()) {"{"}
              </Text>
              <Text dim> throw new Error("Token expired")</Text>
              <Text dim> {"}"}</Text>
              <Text dim> return decoded.user</Text>
              <Text dim>{"}"}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const output = renderStringSync(<ScrollbackExchange />, { width: COLS })
    const lines = output.split("\n")

    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const stripped = stripAnsi(lines[i]!)
      const width = visibleWidth(stripped)
      if (width > COLS) {
        violations.push(`Line ${i}: visible width ${width} > ${COLS}: "${stripped}"`)
      }
    }

    expect(violations, `renderStringSync lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)
  })

  test("inline mode bufferToAnsi does not produce lines exceeding terminal width", async () => {
    const render = createRenderer({ cols: COLS, rows: 40 })

    function ExchangeView() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} testID="exchange">
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text> </Text>
          <Text>Found it. The expiry check compares seconds to milliseconds. Fixing now.</Text>
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="column" marginTop={0}>
              <Text>
                <Text color="yellow" bold>
                  Edit
                </Text>
                <Text dim> src/auth.ts</Text>
              </Text>
              <Box
                flexDirection="column"
                borderStyle="bold"
                borderColor="yellow"
                borderLeft
                borderRight={false}
                borderTop={false}
                borderBottom={false}
                paddingLeft={1}
              >
                <Text>{"  const decoded = jwt.decode(token)"}</Text>
                <Text>{"+ if (decoded.exp < Date.now() / 1000) {"}</Text>
                <Text>{"+   return refreshToken(token)"}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column" gap={1} overflow="hidden">
        <ExchangeView />
      </Box>,
    )

    const buffer = app.lastBuffer()!

    // Import outputPhase to test inline mode specifically
    const { outputPhase } = await import("../src/pipeline/output-phase.js")
    const inlineOutput: string = outputPhase(null, buffer, "inline")

    // Strip ANSI and measure each line
    const lines = inlineOutput.split("\n")
    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const stripped = stripAnsi(lines[i]!)
      const width = visibleWidth(stripped)
      if (width > COLS) {
        violations.push(`Inline output line ${i}: visible width ${width} > ${COLS}: "${stripped}"`)
      }
    }

    expect(violations, `Inline output lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)

    // Also verify buffer width
    expect(buffer.width).toBe(COLS)
  })

  test("all bounding boxes fit within terminal width", () => {
    const render = createRenderer({ cols: COLS, rows: 40 })

    function ToolCallBlock({ tool, args, output }: { tool: string; args: string; output: string[] }) {
      return (
        <Box flexDirection="column" marginTop={0} testID="toolcall">
          <Text>
            <Text color="blue" bold>
              {tool}
            </Text>
            <Text dim> {args}</Text>
          </Text>
          <Box
            flexDirection="column"
            borderStyle="bold"
            borderColor="blue"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
            testID="tooloutput"
          >
            {output.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    function ExchangeView() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} testID="exchange">
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text> </Text>
          <Text>Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.</Text>
          <Box flexDirection="column" marginTop={1} testID="toolarea">
            <ToolCallBlock
              tool="Edit"
              args="src/auth.ts"
              output={[
                "  const decoded = jwt.decode(token)",
                "- if (decoded.exp < Date.now()) {",
                '-   throw new Error("Token expired")',
                "+ if (decoded.exp < Date.now() / 1000) {",
                "+   return refreshToken(token)",
                "  }",
              ]}
            />
          </Box>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column" gap={1} overflow="hidden" testID="root">
        <ExchangeView />
      </Box>,
    )

    const buffer = app.lastBuffer()!
    const rootBox = app.getByTestId("root").boundingBox()!
    const exchangeBox = app.getByTestId("exchange").boundingBox()!
    const toolareaBox = app.getByTestId("toolarea").boundingBox()!
    const toolcallBox = app.getByTestId("toolcall").boundingBox()!
    const tooloutputBox = app.getByTestId("tooloutput").boundingBox()!

    // Buffer fits terminal width
    expect(buffer.width).toBeLessThanOrEqual(COLS)

    // Root box
    expect(rootBox.width, `Root width ${rootBox.width}`).toBeLessThanOrEqual(COLS)

    // ExchangeView fills terminal width exactly (border at col 0 and col 79)
    expect(exchangeBox.width, `Exchange width ${exchangeBox.width}`).toBeLessThanOrEqual(COLS)
    expect(exchangeBox.x + exchangeBox.width, `Exchange right edge`).toBeLessThanOrEqual(COLS)

    // Nested boxes are inside the border
    expect(toolareaBox.x + toolareaBox.width, `Tool area right edge`).toBeLessThanOrEqual(COLS)
    expect(toolcallBox.x + toolcallBox.width, `Tool call right edge`).toBeLessThanOrEqual(COLS)
    expect(tooloutputBox.x + tooloutputBox.width, `Tool output right edge`).toBeLessThanOrEqual(COLS)

    // All text lines fit
    const lines = app.text.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const w = visibleWidth(lines[i]!)
      expect(w, `Line ${i} width ${w}`).toBeLessThanOrEqual(COLS)
    }
  })

  test("bordered box fills EXACTLY terminal width — the root cause of visual overflow", () => {
    // This test documents the root cause:
    // A bordered box without explicit width fills the entire terminal width.
    // The right border character sits at column COLS-1 (the last column).
    // When this output is written to a terminal, the cursor lands at column COLS
    // (past the last column), which triggers "deferred wrap" or auto-wrap on
    // most terminals. The next \n then causes a double line advance (wrap + newline).
    //
    // This is NOT a layout/buffer bug — the content fits exactly within bounds.
    // It's a terminal rendering issue when writing exactly terminal-width characters.

    // Test via renderStringSync (scrollback path)
    function BorderedExchange() {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
          <Text bold color="green">
            {"◆"} Agent
          </Text>
          <Text>Response text here.</Text>
        </Box>
      )
    }

    const output = renderStringSync(<BorderedExchange />, { width: COLS })
    const lines = output.split("\n")

    // The bordered lines should be EXACTLY COLS visible characters.
    // The top border line: ╭──...──╮ = exactly 80 chars
    // The bottom border:   ╰──...──╯ = exactly 80 chars
    // Content lines:       │ ... │   = exactly 80 chars (border chars + padding + content + padding + border)
    const borderLines = lines.filter((l) => {
      const stripped = stripAnsi(l)
      return stripped.includes("╭") || stripped.includes("╰") || stripped.includes("│")
    })

    // Verify: every border line is EXACTLY COLS wide (the problematic condition)
    for (const line of borderLines) {
      const w = visibleWidth(line)
      // This assertion documents that bordered boxes DO fill the terminal exactly.
      // This is by design — but it causes visual overflow on real terminals.
      expect(w, `Border line width should be exactly ${COLS}`).toBe(COLS)
    }

    // No line EXCEEDS COLS (confirming no actual overflow in the data)
    for (let i = 0; i < lines.length; i++) {
      const w = visibleWidth(lines[i]!)
      expect(w, `Line ${i} exceeds ${COLS}`).toBeLessThanOrEqual(COLS)
    }
  })

  test("long text in tool call output wraps within bounds", () => {
    const render = createRenderer({ cols: COLS, rows: 40 })

    const app = render(
      <Box flexDirection="column" overflow="hidden">
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text>Agent response text here</Text>
          <Box
            flexDirection="column"
            borderStyle="bold"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
          >
            <Text>
              {
                "This is a very long line of text that should definitely wrap within the 80-column terminal width boundary and not extend past it"
              }
            </Text>
          </Box>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const width = visibleWidth(lines[i]!)
      if (width > COLS) {
        violations.push(`Line ${i} has width ${width} > ${COLS}: "${lines[i]}"`)
      }
    }

    expect(violations, `Lines exceeding ${COLS} columns:\n${violations.join("\n")}`).toHaveLength(0)
  })
})
