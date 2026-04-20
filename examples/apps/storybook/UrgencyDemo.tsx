/**
 * UrgencyDemo — urgency-is-not-a-token demo section.
 *
 * Feature 4/5 of the full storybook. Rendered as a section inside the
 * COMPONENTS middle pane. Same tone="error" on three different components,
 * three different urgency levels:
 *
 *   <InlineAlert tone="error" />    LOW urgency — passive in-flow message
 *   <Banner tone="error" />         MEDIUM — dismissible top-of-page call
 *   <Dialog tone="error" />         HIGH — blocking modal that interrupts flow
 *
 * Zero `priority` / `urgency` / `severity` prop involved. Urgency is carried
 * by component CHOICE + position + content, never by a Theme token.
 *
 * Sterling has no `InlineAlert`/`Banner` components yet — the demos below are
 * compositional presentations using Box + Text + theme tokens. When those
 * components ship (flagged for a separate bead), they replace these stubs.
 */

import React from "react"
import { Box, Text, Muted, Divider, Strong, Small, Kbd } from "silvery"

function InlineAlertStub({ children }: { children: string }): React.ReactElement {
  return (
    <Box gap={1}>
      <Text color="$error" bold>
        ✗
      </Text>
      <Text color="$error">{children}</Text>
    </Box>
  )
}

function BannerStub({ children }: { children: string }): React.ReactElement {
  return (
    <Box backgroundColor="$error" paddingX={2} paddingY={0} flexDirection="row" width={60}>
      <Text color="$errorfg" bold>
        ✗ {children}
      </Text>
      <Box flexGrow={1} />
      <Text color="$errorfg" dim>
        dismiss ×
      </Text>
    </Box>
  )
}

function DialogStub({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <Box
      borderStyle="double"
      borderColor="$error"
      paddingX={2}
      paddingY={1}
      width={60}
      flexDirection="column"
    >
      <Box gap={1}>
        <Text color="$error" bold>
          ✗
        </Text>
        <Strong>{title}</Strong>
      </Box>
      <Muted>{body}</Muted>
      <Box marginTop={1} gap={1}>
        <Box backgroundColor="$error" paddingX={1}>
          <Text color="$errorfg" bold>
            {" "}
            Continue{" "}
          </Text>
        </Box>
        <Box borderStyle="single" borderColor="$border" paddingX={1}>
          <Text>Cancel</Text>
        </Box>
      </Box>
    </Box>
  )
}

function UrgencyRow({
  level,
  levelLabel,
  component,
  annotation,
}: {
  level: "low" | "medium" | "high"
  levelLabel: string
  component: React.ReactElement
  annotation: string
}): React.ReactElement {
  const levelColor = level === "high" ? "$error" : level === "medium" ? "$warning" : "$info"
  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1}>
        <Text color={levelColor} bold>
          ●
        </Text>
        <Strong>{levelLabel}</Strong>
        <Muted>·</Muted>
        <Muted>{annotation}</Muted>
      </Box>
      <Box paddingX={2} marginTop={0}>
        {component}
      </Box>
    </Box>
  )
}

export function UrgencyDemo(): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Text color="$accent" bold>
          ◆
        </Text>
        <Strong>Urgency is not a token</Strong>
      </Box>
      <Small>
        <Muted>
          Same color. Three urgency levels. Zero `priority` / `severity` prop. Component
          choice + position + content carry urgency — not token vocabulary.
        </Muted>
      </Small>

      <Divider />

      <Box flexDirection="column" gap={1}>
        <UrgencyRow
          level="low"
          levelLabel="low"
          annotation="in-flow · passive"
          component={<InlineAlertStub>Type-check failed in src/app.ts</InlineAlertStub>}
        />

        <UrgencyRow
          level="medium"
          levelLabel="medium"
          annotation="above-the-fold · dismissible"
          component={<BannerStub>Connection lost — retrying…</BannerStub>}
        />

        <UrgencyRow
          level="high"
          levelLabel="high"
          annotation="blocking · interrupts flow"
          component={
            <DialogStub
              title="Delete workspace?"
              body="This removes 3 projects and cannot be undone."
            />
          }
        />
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="$accent"
        paddingX={1}
        marginTop={0}
      >
        <Box gap={1}>
          <Text color="$accent" bold>
            ◆
          </Text>
          <Strong>No `priority` prop needed</Strong>
        </Box>
        <Small>
          <Muted>
            A system that shipped `priority="high"` would reinvent urgency in the token
            vocabulary. Sterling keeps tokens status-only — components carry urgency by
            their <Kbd>shape</Kbd> and <Kbd>placement</Kbd>.
          </Muted>
        </Small>
      </Box>
    </Box>
  )
}
