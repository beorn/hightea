/**
 * PickerDialog Component
 *
 * Generic search-and-select dialog combining ModalDialog + text input + scrolling
 * result list. Handles keyboard routing: arrows for selection, Enter to confirm,
 * Esc to cancel, printable chars for filtering.
 *
 * Uses useReadline internally for full readline editing (kill ring, word movement).
 *
 * Usage:
 * ```tsx
 * <PickerDialog
 *   title="Search"
 *   items={filteredResults}
 *   renderItem={(item, selected) => (
 *     <Text inverse={selected}>{item.name}</Text>
 *   )}
 *   keyExtractor={(item) => item.id}
 *   onSelect={(item) => navigateTo(item)}
 *   onCancel={() => closeDialog()}
 *   onChange={(query) => setFilter(query)}
 *   placeholder="Type to search..."
 * />
 * ```
 */
import React, { useCallback, useRef, useState } from "react"
import { useInput } from "../hooks/useInput.js"
import { Box } from "./Box.js"
import { Text } from "./Text.js"
import { CursorLine } from "./CursorLine.js"
import { ModalDialog } from "./ModalDialog.js"
import { useReadline } from "./useReadline.js"

// =============================================================================
// Types
// =============================================================================

export interface PickerDialogProps<T> {
  /** Dialog title */
  title: string
  /** Placeholder text when input is empty */
  placeholder?: string
  /** Items to display in the result list */
  items: T[]
  /** Render function for each item. `selected` is true for the highlighted item. */
  renderItem: (item: T, selected: boolean) => React.ReactNode
  /** Unique key for each item */
  keyExtractor: (item: T) => string
  /** Called when an item is confirmed (Enter) */
  onSelect: (item: T) => void
  /** Called when the dialog is cancelled (Esc) */
  onCancel: () => void
  /** Called when the input text changes (for filtering) */
  onChange?: (query: string) => void
  /** Initial input value */
  initialValue?: string
  /** Message when items list is empty */
  emptyMessage?: string
  /** Maximum visible items before scrolling (default: 10) */
  maxVisible?: number
  /** Dialog width */
  width?: number
  /** Dialog height (auto-sized if omitted) */
  height?: number
  /** Footer content */
  footer?: React.ReactNode
  /** Input prompt prefix (e.g., "/ " or "All > ") */
  prompt?: string
  /** Prompt color */
  promptColor?: string
  /** Whether the input is active (default: true) */
  isActive?: boolean
}

// =============================================================================
// Component
// =============================================================================

/**
 * Generic search-and-select dialog.
 *
 * Keyboard routing:
 * - Printable chars, Ctrl shortcuts: readline text editing
 * - Up/Down arrows: navigate result list
 * - PgUp/PgDn: scroll by page
 * - Enter: confirm selected item
 * - Esc: cancel dialog
 */
export function PickerDialog<T>({
  title,
  placeholder,
  items,
  renderItem,
  keyExtractor,
  onSelect,
  onCancel,
  onChange,
  initialValue = "",
  emptyMessage = "No items",
  maxVisible = 10,
  width,
  height,
  footer,
  prompt,
  promptColor,
  isActive = true,
}: PickerDialogProps<T>): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Refs for stable callbacks in useInput closures
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  // Readline hook for text editing (kill ring, word movement, etc.)
  const readline = useReadline({
    initialValue,
    onChange: useCallback(
      (value: string) => {
        onChange?.(value)
        setSelectedIndex(0)
      },
      [onChange],
    ),
    isActive,
    handleEnter: false, // We handle Enter for item selection
    handleEscape: false, // We handle Esc for cancel
    handleVerticalArrows: false, // We handle Up/Down for list navigation
  })

  const clampedIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0
  if (clampedIndex !== selectedIndex) {
    setSelectedIndex(clampedIndex)
  }

  // Scroll offset: center the selected item in the visible window
  const effectiveMaxVisible = Math.min(maxVisible, items.length)
  const scrollOffset =
    items.length > effectiveMaxVisible
      ? Math.max(0, Math.min(clampedIndex - Math.floor(effectiveMaxVisible / 2), items.length - effectiveMaxVisible))
      : 0

  // Navigation handler (separate from readline text editing)
  useInput(
    (_input, key) => {
      if (key.escape) {
        onCancelRef.current()
        return
      }
      if (key.return) {
        const currentItems = itemsRef.current
        const idx = selectedIndexRef.current
        const item = currentItems[Math.min(idx, currentItems.length - 1)]
        if (item) onSelectRef.current(item)
        return
      }
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(i + 1, Math.max(0, itemsRef.current.length - 1)))
        return
      }
      if (key.pageUp) {
        setSelectedIndex((i) => Math.max(0, i - effectiveMaxVisible))
        return
      }
      if (key.pageDown) {
        setSelectedIndex((i) => Math.min(i + effectiveMaxVisible, Math.max(0, itemsRef.current.length - 1)))
        return
      }
    },
    { isActive },
  )

  // Visible items slice
  const visibleItems = items.slice(scrollOffset, scrollOffset + effectiveMaxVisible)

  // Show placeholder when input is empty
  const showPlaceholder = !readline.value && placeholder

  return (
    <ModalDialog title={title} width={width} height={height} footer={footer}>
      {/* Search input */}
      <Box flexShrink={0} flexDirection="column">
        <Box>
          {prompt && <Text color={promptColor}>{prompt}</Text>}
          {showPlaceholder ? (
            <Text dimColor>{placeholder}</Text>
          ) : (
            <CursorLine beforeCursor={readline.beforeCursor} afterCursor={readline.afterCursor} showCursor={isActive} />
          )}
        </Box>
        <Text dimColor>{"─".repeat(40)}</Text>
      </Box>

      {/* Result list */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {items.length === 0 ? (
          <Text dimColor>{emptyMessage}</Text>
        ) : (
          visibleItems.map((item, i) => {
            const actualIndex = scrollOffset + i
            const isSelected = actualIndex === clampedIndex
            return <React.Fragment key={keyExtractor(item)}>{renderItem(item, isSelected)}</React.Fragment>
          })
        )}
      </Box>
    </ModalDialog>
  )
}
