/**
 * CopyModeFeature integration tests.
 *
 * Tests the service layer wrapping the headless copy-mode machine,
 * including SelectionFeature integration.
 */

import { describe, it, expect, vi } from "vitest"
import { createSelectionFeature, type SelectionFeature } from "@silvery/ag-term/features/selection"
import { createCopyModeFeature, type CopyModeFeature } from "@silvery/ag-term/features/copy-mode"
import { createCapabilityRegistry } from "@silvery/create/internal/capability-registry"
import { createInputRouter } from "@silvery/create/internal/input-router"
import { SELECTION_CAPABILITY, COPY_MODE_CAPABILITY } from "@silvery/create/internal/capabilities"

// ============================================================================
// Helpers
// ============================================================================

function setup(opts?: { bufferWidth?: number; bufferHeight?: number }) {
  const invalidate = vi.fn()
  const selection = createSelectionFeature({ invalidate })
  const copyMode = createCopyModeFeature({
    selection,
    invalidate,
    bufferWidth: opts?.bufferWidth ?? 80,
    bufferHeight: opts?.bufferHeight ?? 24,
  })
  return { invalidate, selection, copyMode }
}

// ============================================================================
// SelectionFeature
// ============================================================================

describe("SelectionFeature", () => {
  it("starts with no selection", () => {
    const { selection } = setup()
    expect(selection.state.range).toBeNull()
    expect(selection.getRange()).toBeNull()
  })

  it("setRange updates state and notifies", () => {
    const { selection, invalidate } = setup()
    const listener = vi.fn()
    selection.subscribe(listener)

    selection.setRange({
      anchor: { col: 0, row: 0 },
      head: { col: 10, row: 0 },
    })

    expect(selection.getRange()).toEqual({
      anchor: { col: 0, row: 0 },
      head: { col: 10, row: 0 },
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalled()
  })

  it("clear resets selection", () => {
    const { selection } = setup()
    selection.setRange({ anchor: { col: 0, row: 0 }, head: { col: 5, row: 0 } })
    selection.clear()
    expect(selection.getRange()).toBeNull()
  })

  it("subscribe returns unsubscribe function", () => {
    const { selection } = setup()
    const listener = vi.fn()
    const unsub = selection.subscribe(listener)

    selection.setRange({ anchor: { col: 0, row: 0 }, head: { col: 1, row: 0 } })
    expect(listener).toHaveBeenCalledOnce()

    unsub()
    selection.setRange({ anchor: { col: 0, row: 0 }, head: { col: 2, row: 0 } })
    expect(listener).toHaveBeenCalledOnce() // not called again
  })

  it("dispatch forwards to state machine", () => {
    const { selection } = setup()
    selection.dispatch({ type: "start", col: 5, row: 3 })
    expect(selection.state.selecting).toBe(true)
    expect(selection.state.range).toBeTruthy()
  })

  it("dispose clears listeners and state", () => {
    const { selection } = setup()
    const listener = vi.fn()
    selection.subscribe(listener)
    selection.setRange({ anchor: { col: 0, row: 0 }, head: { col: 5, row: 0 } })
    listener.mockClear()

    selection.dispose()
    expect(selection.state.range).toBeNull()
    // After dispose, listener should not be called
    // (Note: setRange after dispose would add to a cleared state, but listeners are gone)
  })
})

// ============================================================================
// CopyModeFeature — enter/exit
// ============================================================================

describe("CopyModeFeature", () => {
  describe("enter/exit state management", () => {
    it("starts inactive", () => {
      const { copyMode } = setup()
      expect(copyMode.state.active).toBe(false)
    })

    it("enter activates copy mode", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 10, 80, 24)
      expect(copyMode.state.active).toBe(true)
      expect(copyMode.state.cursor).toEqual({ col: 5, row: 10 })
    })

    it("enter with defaults", () => {
      const { copyMode } = setup()
      copyMode.enter()
      expect(copyMode.state.active).toBe(true)
      expect(copyMode.state.cursor).toEqual({ col: 0, row: 0 })
    })

    it("exit deactivates copy mode", () => {
      const { copyMode } = setup()
      copyMode.enter()
      copyMode.exit()
      expect(copyMode.state.active).toBe(false)
    })

    it("exit clears selection", () => {
      const { copyMode, selection } = setup()
      copyMode.enter()
      copyMode.startVisual()
      expect(selection.getRange()).toBeTruthy()

      copyMode.exit()
      expect(selection.getRange()).toBeNull()
    })

    it("subscribe notifies on state changes", () => {
      const { copyMode } = setup()
      const listener = vi.fn()
      copyMode.subscribe(listener)

      copyMode.enter()
      expect(listener).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Motion keys
  // ==========================================================================

  describe("motion keys (h/j/k/l)", () => {
    it("h moves left", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.motion("h")
      expect(copyMode.state.cursor.col).toBe(4)
      expect(copyMode.state.cursor.row).toBe(5)
    })

    it("l moves right", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.motion("l")
      expect(copyMode.state.cursor.col).toBe(6)
      expect(copyMode.state.cursor.row).toBe(5)
    })

    it("j moves down", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.motion("j")
      expect(copyMode.state.cursor.col).toBe(5)
      expect(copyMode.state.cursor.row).toBe(6)
    })

    it("k moves up", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.motion("k")
      expect(copyMode.state.cursor.col).toBe(5)
      expect(copyMode.state.cursor.row).toBe(4)
    })

    it("clamps at left edge", () => {
      const { copyMode } = setup()
      copyMode.enter(0, 5, 80, 24)
      copyMode.motion("h")
      expect(copyMode.state.cursor.col).toBe(0)
    })

    it("clamps at top edge", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 0, 80, 24)
      copyMode.motion("k")
      expect(copyMode.state.cursor.row).toBe(0)
    })

    it("clamps at right edge", () => {
      const { copyMode } = setup()
      copyMode.enter(79, 5, 80, 24)
      copyMode.motion("l")
      expect(copyMode.state.cursor.col).toBe(79)
    })

    it("clamps at bottom edge", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 23, 80, 24)
      copyMode.motion("j")
      expect(copyMode.state.cursor.row).toBe(23)
    })

    it("ignores unknown motion keys", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.motion("x") // not a motion key
      expect(copyMode.state.cursor).toEqual({ col: 5, row: 5 })
    })

    it("does nothing when not active", () => {
      const { copyMode } = setup()
      copyMode.motion("j")
      expect(copyMode.state.active).toBe(false)
    })
  })

  // ==========================================================================
  // Visual selection + yank
  // ==========================================================================

  describe("visual selection + yank", () => {
    it("v starts character visual mode", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisual()
      expect(copyMode.state.visual).toBe(true)
      expect(copyMode.state.visualLine).toBe(false)
    })

    it("V starts line visual mode", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisualLine()
      expect(copyMode.state.visualLine).toBe(true)
      expect(copyMode.state.visual).toBe(false)
    })

    it("visual mode syncs selection range to SelectionFeature", () => {
      const { copyMode, selection } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisual()

      // Selection should be set on the feature
      const range = selection.getRange()
      expect(range).toBeTruthy()
      expect(range!.anchor).toEqual({ col: 5, row: 5 })
      expect(range!.head).toEqual({ col: 5, row: 5 })
    })

    it("motion in visual mode updates selection", () => {
      const { copyMode, selection } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisual()
      copyMode.motion("l")
      copyMode.motion("l")
      copyMode.motion("j")

      const range = selection.getRange()
      expect(range).toBeTruthy()
      expect(range!.anchor).toEqual({ col: 5, row: 5 })
      expect(range!.head).toEqual({ col: 7, row: 6 })
    })

    it("yank exits copy mode and clears selection", () => {
      const { copyMode, selection } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisual()
      copyMode.motion("l")
      copyMode.yank()

      expect(copyMode.state.active).toBe(false)
      // Selection is cleared via copy effect processing
      expect(selection.getRange()).toBeNull()
    })

    it("yank without visual mode just exits", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.yank()
      expect(copyMode.state.active).toBe(false)
    })

    it("toggling visual mode off clears anchor", () => {
      const { copyMode } = setup()
      copyMode.enter(5, 5, 80, 24)
      copyMode.startVisual()
      expect(copyMode.state.visual).toBe(true)
      copyMode.startVisual() // toggle off
      expect(copyMode.state.visual).toBe(false)
      expect(copyMode.state.anchor).toBeNull()
    })
  })

  // ==========================================================================
  // Invalidation
  // ==========================================================================

  describe("invalidation", () => {
    it("enter triggers invalidate", () => {
      const { copyMode, invalidate } = setup()
      invalidate.mockClear()
      copyMode.enter()
      expect(invalidate).toHaveBeenCalled()
    })

    it("motion triggers invalidate", () => {
      const { copyMode, invalidate } = setup()
      copyMode.enter(5, 5, 80, 24)
      invalidate.mockClear()
      copyMode.motion("j")
      expect(invalidate).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Dispose
  // ==========================================================================

  describe("dispose", () => {
    it("resets state and clears listeners", () => {
      const { copyMode } = setup()
      const listener = vi.fn()
      copyMode.subscribe(listener)
      copyMode.enter()
      listener.mockClear()

      copyMode.dispose()
      expect(copyMode.state.active).toBe(false)
    })
  })
})

// ============================================================================
// Capability Registry integration
// ============================================================================

describe("CapabilityRegistry integration", () => {
  it("features register in capability registry", () => {
    const registry = createCapabilityRegistry()
    const invalidate = vi.fn()
    const selection = createSelectionFeature({ invalidate })
    const copyMode = createCopyModeFeature({ selection, invalidate })

    registry.register(SELECTION_CAPABILITY, selection)
    registry.register(COPY_MODE_CAPABILITY, copyMode)

    expect(registry.get<SelectionFeature>(SELECTION_CAPABILITY)).toBe(selection)
    expect(registry.get<CopyModeFeature>(COPY_MODE_CAPABILITY)).toBe(copyMode)
  })

  it("missing selection capability is detectable", () => {
    const registry = createCapabilityRegistry()
    expect(registry.get<SelectionFeature>(SELECTION_CAPABILITY)).toBeUndefined()
  })
})

// ============================================================================
// InputRouter integration
// ============================================================================

describe("InputRouter integration", () => {
  it("copy-mode key handler claims keys when active", () => {
    const invalidate = vi.fn()
    const router = createInputRouter({ invalidate })
    const selection = createSelectionFeature({ invalidate })
    const copyMode = createCopyModeFeature({ selection, invalidate })

    // Register a handler that proxies to copy-mode
    router.registerKeyHandler(200, (event) => {
      if (!copyMode.state.active) return false
      if (["h", "j", "k", "l"].includes(event.key)) {
        copyMode.motion(event.key)
        return true
      }
      if (event.key === "Escape") {
        copyMode.exit()
        return true
      }
      return false
    })

    // Before entering copy-mode, keys are not claimed
    expect(router.dispatchKey({ key: "j" })).toBe(false)

    // Enter copy-mode
    copyMode.enter(5, 5, 80, 24)

    // Now keys are claimed
    expect(router.dispatchKey({ key: "j" })).toBe(true)
    expect(copyMode.state.cursor.row).toBe(6)

    // Escape exits and unclaims
    expect(router.dispatchKey({ key: "Escape" })).toBe(true)
    expect(copyMode.state.active).toBe(false)
    expect(router.dispatchKey({ key: "j" })).toBe(false)
  })
})
