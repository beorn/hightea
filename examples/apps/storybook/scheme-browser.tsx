/**
 * SchemeBrowser — scrollable list of all bundled schemes with mini swatches.
 *
 * Pure presentational component. The parent owns selectedIndex and passes
 * the list of entries.
 */

import React from "react"
import { Box, Text, Muted, Divider, Small } from "silvery"
import type { StorybookEntry } from "./types"

interface Props {
  entries: StorybookEntry[]
  selectedIndex: number
  /** When true, a faint secondary cursor marker (for compare mode). */
  secondaryIndex?: number
  /** Title shown at the top of the list. */
  title?: string
  /** Fixed column width. */
  width?: number
}

function MiniSwatch({ entry }: { entry: StorybookEntry }) {
  const { palette } = entry
  return (
    <Text>
      <Text color={palette.red}>{"█"}</Text>
      <Text color={palette.green}>{"█"}</Text>
      <Text color={palette.blue}>{"█"}</Text>
      <Text color={palette.yellow}>{"█"}</Text>
      <Text color={palette.magenta}>{"█"}</Text>
      <Text color={palette.cyan}>{"█"}</Text>
    </Text>
  )
}

export function SchemeBrowser({
  entries,
  selectedIndex,
  secondaryIndex,
  title = "Palettes",
  width = 30,
}: Props) {
  return (
    <Box flexDirection="column" width={width} borderStyle="single" overflow="scroll" scrollTo={selectedIndex}>
      <Box paddingX={1} gap={1}>
        <Text bold color="$primary">
          {title}
        </Text>
        <Muted>({entries.length})</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        {entries.map((entry, i) => {
          const isPrimary = i === selectedIndex
          const isSecondary = secondaryIndex !== undefined && i === secondaryIndex
          const marker = isPrimary ? "▸" : isSecondary ? "·" : " "
          const label = entry.name.padEnd(Math.max(width - 12, 14))
          return (
            <Box key={entry.name}>
              <Text inverse={isPrimary} color={isSecondary && !isPrimary ? "$accent" : undefined}>
                {marker} {label}
              </Text>
              <Text> </Text>
              <MiniSwatch entry={entry} />
            </Box>
          )
        })}
      </Box>
      <Divider />
      <Box paddingX={1} flexDirection="column">
        <Small>
          <Muted>{entries.filter((e) => e.dark).length} dark</Muted>
        </Small>
        <Small>
          <Muted>{entries.filter((e) => !e.dark).length} light</Muted>
        </Small>
      </Box>
    </Box>
  )
}
