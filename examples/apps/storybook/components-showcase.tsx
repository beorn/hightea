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
} from "silvery"

/**
 * Visual-only preview of TextInput. We can't use the real silvery TextInput
 * directly here: `isActive={true}` captures j/k (stealing from storybook
 * navigation), and `isActive={false}` hides the cursor glyph. Silvery's
 * TextInput doesn't split "visual focus" from "input capture" — tracked as
 * a follow-up in km-silvery.text-input-readonly.
 *
 * For now: a thin replica that mimics TextInput's rendered output (border,
 * placeholder styling, cursor glyph) but does not capture input.
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
  const hasValue = value.length > 0
  return (
    <Box flexDirection="column">
      <Muted>{label}</Muted>
      <Box
        borderStyle="single"
        borderColor={focused ? "$focusborder" : "$inputborder"}
        paddingX={1}
        width={36}
      >
        {hasValue ? (
          <Text>
            <Text>{value}</Text>
            {focused ? <Text inverse> </Text> : null}
          </Text>
        ) : focused ? (
          <Text>
            <Text inverse> </Text>
            <Text color="$disabledfg">{placeholder ? placeholder.slice(1) : ""}</Text>
          </Text>
        ) : (
          <Text color="$disabledfg">{placeholder ?? ""}</Text>
        )}
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
