/**
 * ComponentShowcase — real instances of silvery's canonical components.
 *
 * Every widget is rendered with realistic content so the active theme's
 * tokens get exercised across typography, badges, inputs, spinners, dialogs,
 * tables, etc.
 */

import React from "react"
import {
  Box,
  Text,
  Muted,
  Small,
  Strong,
  Em,
  Badge,
  Spinner,
  ProgressBar,
  Divider,
  Kbd,
  Link,
  Code,
  CodeBlock,
  Blockquote,
  Toggle,
  H1,
  H2,
  H3,
  P,
  Lead,
  TextInput,
} from "silvery"

/**
 * Show silvery's real TextInput with isActive toggled. No fake replica —
 * pass-through to the canonical component exercises the same code path
 * real apps use, and the real fake-cursor / focus-border styling.
 */
function TextInputPreview({
  label,
  value,
  placeholder,
  focused,
}: {
  label: string
  value: string
  placeholder?: string
  focused?: boolean
}) {
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  return (
    <Box flexDirection="column">
      <Muted>{label}</Muted>
      <Box width={36}>
        <TextInput
          value={text}
          onChange={setText}
          placeholder={placeholder}
          isActive={!!focused}
        />
      </Box>
    </Box>
  )
}

interface ComponentShowcaseProps {
  /**
   * Reserved for future interactive/non-interactive toggle. Currently unused
   * (no interactive components remain in the showcase). Keep the prop for
   * compatibility with CompareView.
   */
  interactive?: boolean
}

export function ComponentShowcase(_props: ComponentShowcaseProps = {}) {
  return (
    <Box flexDirection="column" gap={1}>
      <TypographySection />
      <Divider />
      <BadgesSection />
      <Divider />
      <IndicatorsSection />
      <Divider />
      <InputsSection />
      <Divider />
      <DialogSection />
      <Divider />
      <TextBlocksSection />
      <Divider />
      <CodeSample />
    </Box>
  )
}

/**
 * Syntax-highlighted code snippet — uses the `$color0..$color15` raw ANSI
 * palette slots as silvery's token taxonomy prescribes for syntax highlighting
 * ("exact terminal color parity matters"). See token-taxonomy.md.
 *
 * Mapping (tree-sitter / vim / Neovim convention):
 *   keyword / control flow → $color1  (red)
 *   string literal         → $color2  (green)
 *   number / constant      → $color3  (yellow)
 *   function name          → $color4  (blue)
 *   type / purple          → $color5  (magenta)
 *   type name / built-in   → $color6  (cyan)
 *   operator / default fg  → $fg      (plain)
 *   comment                → $muted   (semantic, contrast-adjusted)
 *   link in comment        → $color4 + underline
 *
 * Comments DELIBERATELY route through $muted (contrast-adjusted) instead of
 * $color8 (raw bright-black). On low-contrast schemes like catppuccin-frappe,
 * raw $color8 against $mutedbg is near-invisible. $muted is repaired against
 * the surface it renders on during deriveTheme, so it stays readable across
 * all 84 bundled schemes.
 */
function CodeSample() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Code sample (syntax highlighting via $color0..$color15)</H2>
      <Box backgroundColor="$mutedbg" padding={1} flexDirection="column">
        <Box>
          <Text color="$muted">// See </Text>
          <Text color="$color4" underlineStyle="single">
            https://silvery.dev
          </Text>
          <Text color="$muted"> — theme tokens in action</Text>
        </Box>

        <Box>
          <Text color="$color1">export async </Text>
          <Text color="$color1">function </Text>
          <Text color="$color4">resolveToken</Text>
          <Text color="$fg">(name</Text>
          <Text color="$fg">: </Text>
          <Text color="$color6">string</Text>
          <Text color="$fg">, theme</Text>
          <Text color="$fg">?: </Text>
          <Text color="$color6">Theme</Text>
          <Text color="$fg">): </Text>
          <Text color="$color6">Promise</Text>
          <Text color="$fg">{"<"}</Text>
          <Text color="$color6">string</Text>
          <Text color="$fg">{">"}</Text>
          <Text color="$fg"> {"{"}</Text>
        </Box>

        <Box>
          <Text>{"  "}</Text>
          <Text color="$color1">const</Text>
          <Text color="$fg"> result = </Text>
          <Text color="$color1">await </Text>
          <Text color="$color4">lookup</Text>
          <Text color="$fg">(</Text>
          <Text color="$color2">{`"$`}</Text>
          <Text color="$color2">{`{name}"`}</Text>
          <Text color="$fg">, </Text>
          <Text color="$color3">42</Text>
          <Text color="$fg">)</Text>
        </Box>

        <Box>
          <Text>{"  "}</Text>
          <Text color="$color1">if</Text>
          <Text color="$fg"> (!result) </Text>
          <Text color="$color1">throw new </Text>
          <Text color="$color6">Error</Text>
          <Text color="$fg">(</Text>
          <Text color="$color2">{`"not found"`}</Text>
          <Text color="$fg">)</Text>
        </Box>

        <Box>
          <Text>{"  "}</Text>
          <Text color="$color1">return </Text>
          <Text color="$fg">result</Text>
        </Box>

        <Box>
          <Text color="$fg">{"}"}</Text>
        </Box>
      </Box>
    </Box>
  )
}

function TypographySection() {
  return (
    <Box flexDirection="column" paddingX={1}>
      <H2>Typography</H2>
      <H1>H1 — Page Title</H1>
      <H2>H2 — Section Heading</H2>
      <H3>H3 — Group Heading</H3>
      <Lead>Lead — introductory italic lead text</Lead>
      <P>P — ordinary body paragraph. The quick brown fox jumps over the lazy dog.</P>
      <Muted>Muted — secondary information</Muted>
      <Small>Small — fine print and captions</Small>
      <Box gap={1} marginTop={1}>
        <Strong>Strong</Strong>
        <Em>Em</Em>
        <Code>inline code</Code>
        <Kbd>⌘K</Kbd>
        <Kbd>Enter</Kbd>
        <Link href="https://silvery.dev">silvery.dev</Link>
      </Box>
    </Box>
  )
}

function BadgesSection() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Badges</H2>
      <Box gap={1} flexWrap="wrap">
        <Badge label="default" variant="default" />
        <Badge label="primary" variant="primary" />
        <Badge label="success" variant="success" />
        <Badge label="warning" variant="warning" />
        <Badge label="error" variant="error" />
      </Box>
    </Box>
  )
}

function IndicatorsSection() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Indicators</H2>
      <Box gap={3}>
        <Box gap={1}>
          <Spinner />
          <Muted>Loading…</Muted>
        </Box>
        <Box gap={1}>
          <Muted>25%</Muted>
          <Box width={16}>
            <ProgressBar value={0.25} />
          </Box>
        </Box>
        <Box gap={1}>
          <Muted>65%</Muted>
          <Box width={16}>
            <ProgressBar value={0.65} />
          </Box>
        </Box>
        <Box gap={1}>
          <Muted>100%</Muted>
          <Box width={16}>
            <ProgressBar value={1} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function InputsSection() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Inputs</H2>
      <Box gap={2} flexWrap="wrap">
        <TextInputPreview label="TextInput (empty)" value="" placeholder="Search…" />
        <TextInputPreview label="TextInput (focused)" value="storybook" focused />
      </Box>
      <Box gap={2} flexWrap="wrap" marginTop={1}>
        <Toggle value={true} onChange={() => {}} label="Enabled" />
        <Toggle value={false} onChange={() => {}} label="Disabled" />
      </Box>
    </Box>
  )
}

function DialogSection() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Dialog / Popover</H2>
      <Box
        borderStyle="round"
        paddingX={1}
        backgroundColor="$popoverbg"
        flexDirection="column"
        width={48}
      >
        <Text color="$popover" bold>
          Confirm deletion
        </Text>
        <Text color="$popover">
          This action can&apos;t be undone. The 3 selected items will be removed.
        </Text>
        <Box gap={1} marginTop={1}>
          <Badge label="Cancel" variant="default" />
          <Badge label="Delete" variant="error" />
        </Box>
      </Box>
    </Box>
  )
}

function TextBlocksSection() {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H2>Blocks</H2>
      <Blockquote>
        &ldquo;The best interfaces are invisible&rdquo; — design tokens make that possible.
      </Blockquote>
      <CodeBlock>{`bun add silvery     # install
bun run storybook   # explore design system`}</CodeBlock>
    </Box>
  )
}
