/**
 * Pane - A focusable wrapper component for multi-pane layouts.
 *
 * Renders a bordered box that highlights when focus is within its subtree.
 * Designed for composing multi-pane layouts where each section needs visual
 * focus feedback.
 *
 * Usage:
 * ```tsx
 * <Box flexDirection="row">
 *   <Pane title="Editor">
 *     <TextArea />
 *   </Pane>
 *   <Pane title="Preview">
 *     <Text>Preview content</Text>
 *   </Pane>
 * </Box>
 * ```
 */

import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"
import { useFocusWithin } from "@silvery/react/hooks/useFocusWithin"

// =============================================================================
// Types
// =============================================================================

export interface PaneProps {
  /** Title shown in the border */
  title?: string
  /** Children content */
  children: React.ReactNode
  /** Test ID for focus management. Auto-generated from title if not provided. */
  testID?: string
  /** Width (passed to outer Box) */
  width?: number | string
  /** Height (passed to outer Box) */
  height?: number | string
  /** Flex grow (passed to outer Box). Default: 1 */
  flexGrow?: number
}

// =============================================================================
// Component
// =============================================================================

export function Pane({ title, children, testID, width, height, flexGrow = 1 }: PaneProps): React.ReactElement {
  const id = testID ?? title?.toLowerCase().replace(/\s+/g, "-") ?? "pane"
  const hasFocus = useFocusWithin(id)

  return (
    <Box
      testID={id}
      focusable
      flexDirection="column"
      borderStyle="single"
      borderColor={hasFocus ? "$primary" : "$border"}
      width={width}
      height={height}
      flexGrow={flexGrow}
      overflow="hidden"
    >
      {title && (
        <Box paddingX={1}>
          <Text color={hasFocus ? "$primary" : "$border"} bold={hasFocus}>
            {title}
          </Text>
        </Box>
      )}
      {children}
    </Box>
  )
}
