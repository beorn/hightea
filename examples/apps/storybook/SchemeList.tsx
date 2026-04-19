/**
 * SchemeList — left pane.
 *
 * Renders the 84 built-in color schemes as a scrollable SelectList. Selecting
 * a scheme rethemes the whole app (ThemeProvider at the root).
 *
 * MVP navigation: Tab / Shift-Tab (or j/k when the left pane is focused) cycle
 * the highlighted scheme. Enter confirms (no-op — selection is already live).
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, SelectList, type SelectOption } from "silvery"

export interface SchemeListProps {
  schemes: readonly string[]
  selectedIndex: number
  onSelect: (index: number) => void
  focused: boolean
}

export function SchemeList({
  schemes,
  selectedIndex,
  onSelect,
  focused,
}: SchemeListProps): React.ReactElement {
  const items: SelectOption[] = useMemo(
    () => schemes.map((name) => ({ label: name, value: name })),
    [schemes],
  )

  // maxVisible is computed from the container height at render time.
  // Fallback for very small terminals: show at least 10.
  return (
    <Box
      flexDirection="column"
      width={22}
      borderStyle="single"
      borderColor={focused ? "$accent" : "$border"}
    >
      <Box paddingX={1}>
        <Text bold color="$accent">
          SCHEMES
        </Text>
      </Box>
      <Box paddingX={1}>
        <Muted>{schemes.length} palettes</Muted>
      </Box>
      <Box paddingX={1} flexGrow={1} overflow="hidden">
        <SelectList
          items={items}
          highlightedIndex={selectedIndex}
          onHighlight={onSelect}
          isActive={focused}
          indicator="▸ "
        />
      </Box>
    </Box>
  )
}
