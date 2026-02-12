import React from "react"
import { Box, Text } from "../src/index.js"

export interface ExampleMeta {
  name: string
  description: string
  /** API features showcased, e.g. ["VirtualList", "useContentRect()"] */
  features?: string[]
}

interface Props {
  meta: ExampleMeta
  /** Short controls legend, e.g. "j/k navigate  q quit" */
  controls?: string
  children: React.ReactNode
}

/**
 * Compact header shown when examples run standalone.
 * Uses dim text + no border to stay visually distinct from example content.
 */
export function ExampleBanner({ meta, controls, children }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* One-line header: dimmed to not compete with example UI */}
      <Box paddingX={1} gap={1}>
        <Text dim color="yellow">
          {"▸ inkx"}
        </Text>
        <Text bold>{meta.name}</Text>
        <Text dim>— {meta.description}</Text>
      </Box>
      {meta.features && meta.features.length > 0 && (
        <Box paddingX={1}>
          <Text dim>
            {"  "}
            {meta.features.join(" · ")}
          </Text>
        </Box>
      )}
      {controls && (
        <Box paddingX={1}>
          <Text dim>
            {"  "}
            {controls}
          </Text>
        </Box>
      )}
      {children}
    </Box>
  )
}
