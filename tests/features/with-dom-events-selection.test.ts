/**
 * withDomEvents �� selection integration tests.
 *
 * Tests the wiring between withDomEvents, InputRouter, CapabilityRegistry,
 * and SelectionFeature. Verifies that:
 * - withDomEvents creates and exposes capabilityRegistry, inputRouter, selectionFeature
 * - Selection is enabled via { selection: true }
 * - InputRouter dispatches mouse events to the selection handler
 * - Invalidation callback is called during selection
 * - CapabilityRegistry is shared between withTerminal and withDomEvents
 */

import { describe, test, expect, vi } from "vitest"
import { withDomEvents, type AppWithDomEvents } from "../../packages/create/src/with-dom-events"
import { withTerminal, type AppWithTerminal } from "../../packages/create/src/with-terminal"
import { SELECTION_CAPABILITY, CLIPBOARD_CAPABILITY, INPUT_ROUTER } from "../../packages/create/src/internal/capabilities"
import type { SelectionFeature } from "../../packages/ag-term/src/features/selection"
import type { ClipboardCapability } from "../../packages/ag-term/src/features/clipboard-capability"
import type { InputRouter } from "../../packages/create/src/internal/input-router"
import { createBuffer, type TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal mock App for withDomEvents tests. */
function createMockApp(buffer?: TerminalBuffer) {
  const mockBuffer = buffer ?? createTestBuffer()
  const container = {
    type: "box",
    testID: "root",
    children: [],
    screenRect: { x: 0, y: 0, width: 40, height: 10 },
    props: {},
  }

  return {
    getContainer: () => container,
    press: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    doubleClick: vi.fn(async () => {}),
    wheel: vi.fn(async () => {}),
    lastBuffer: () => mockBuffer,
    focusManager: undefined,
    // For invalidation wiring
    store: {
      setState: vi.fn((fn: (state: any) => any) => fn({})),
      getState: () => ({}),
      subscribe: () => () => {},
    },
  } as any
}

function createTestBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 10)
  const text = "Hello World"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]! })
  }
  return buffer
}

// ============================================================================
// Plugin composition
// ============================================================================

describe("withDomEvents — plugin composition", () => {
  test("exposes capabilityRegistry on enhanced app", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as typeof mockApp & AppWithDomEvents

    expect(enhanced.capabilityRegistry).toBeDefined()
    expect(typeof enhanced.capabilityRegistry.register).toBe("function")
    expect(typeof enhanced.capabilityRegistry.get).toBe("function")
  })

  test("exposes inputRouter on enhanced app", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as typeof mockApp & AppWithDomEvents

    expect(enhanced.inputRouter).toBeDefined()
    expect(typeof enhanced.inputRouter.registerMouseHandler).toBe("function")
    expect(typeof enhanced.inputRouter.dispatchMouse).toBe("function")
  })

  test("inputRouter is registered in capability registry", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as typeof mockApp & AppWithDomEvents

    const router = enhanced.capabilityRegistry.get<InputRouter>(INPUT_ROUTER)
    expect(router).toBe(enhanced.inputRouter)
  })

  test("selectionFeature is undefined when selection not enabled", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as typeof mockApp & AppWithDomEvents

    expect(enhanced.selectionFeature).toBeUndefined()
  })

  test("selectionFeature is created when selection: true", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    expect(enhanced.selectionFeature).toBeDefined()
    expect(typeof enhanced.selectionFeature!.handleMouseDown).toBe("function")
    expect(typeof enhanced.selectionFeature!.handleMouseMove).toBe("function")
    expect(typeof enhanced.selectionFeature!.handleMouseUp).toBe("function")
  })

  test("selectionFeature is registered in capability registry", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    const feature = enhanced.capabilityRegistry.get<SelectionFeature>(SELECTION_CAPABILITY)
    expect(feature).toBe(enhanced.selectionFeature)
  })
})

// ============================================================================
// Selection via input router
// ============================================================================

describe("withDomEvents — selection via input router", () => {
  test("mousedown dispatched through router starts selection", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    enhanced.inputRouter.dispatchMouse({
      x: 2,
      y: 0,
      button: 0,
      type: "mousedown",
    })

    expect(enhanced.selectionFeature!.state.selecting).toBe(true)
    expect(enhanced.selectionFeature!.state.range).not.toBeNull()
    expect(enhanced.selectionFeature!.state.range!.anchor).toEqual({ col: 2, row: 0 })
  })

  test("mousemove during selection extends range", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    enhanced.inputRouter.dispatchMouse({
      x: 0,
      y: 0,
      button: 0,
      type: "mousedown",
    })

    enhanced.inputRouter.dispatchMouse({
      x: 8,
      y: 0,
      button: 0,
      type: "mousemove",
    })

    expect(enhanced.selectionFeature!.state.range!.head).toEqual({ col: 8, row: 0 })
  })

  test("mousemove during selection is claimed (returns true)", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    enhanced.inputRouter.dispatchMouse({
      x: 0,
      y: 0,
      button: 0,
      type: "mousedown",
    })

    const claimed = enhanced.inputRouter.dispatchMouse({
      x: 5,
      y: 0,
      button: 0,
      type: "mousemove",
    })

    expect(claimed).toBe(true)
  })

  test("mouseup finishes selection", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    enhanced.inputRouter.dispatchMouse({ x: 0, y: 0, button: 0, type: "mousedown" })
    enhanced.inputRouter.dispatchMouse({ x: 5, y: 0, button: 0, type: "mousemove" })
    enhanced.inputRouter.dispatchMouse({ x: 5, y: 0, button: 0, type: "mouseup" })

    expect(enhanced.selectionFeature!.state.selecting).toBe(false)
    expect(enhanced.selectionFeature!.state.range).not.toBeNull()
  })

  test("right-click (button 2) does not start selection", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    enhanced.inputRouter.dispatchMouse({
      x: 0,
      y: 0,
      button: 2,
      type: "mousedown",
    })

    expect(enhanced.selectionFeature!.state.selecting).toBe(false)
    expect(enhanced.selectionFeature!.state.range).toBeNull()
  })
})

// ============================================================================
// Invalidation wiring
// ============================================================================

describe("withDomEvents — invalidation", () => {
  test("selection state change triggers store.setState (invalidation)", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    // Store setState should have been set up as invalidation target
    const storeSetState = mockApp.store.setState

    enhanced.inputRouter.dispatchMouse({ x: 0, y: 0, button: 0, type: "mousedown" })

    // The invalidation callback should have triggered setState
    expect(storeSetState).toHaveBeenCalled()
  })

  test("invalidate() on inputRouter calls the invalidation mechanism", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents({ selection: true })(mockApp) as typeof mockApp & AppWithDomEvents

    const storeSetState = mockApp.store.setState
    storeSetState.mockClear()

    enhanced.inputRouter.invalidate()

    expect(storeSetState).toHaveBeenCalled()
  })
})

// ============================================================================
// Capability registry sharing
// ============================================================================

describe("withDomEvents — registry sharing", () => {
  test("picks up existing capabilityRegistry from app (set by withTerminal)", () => {
    const mockApp = createMockApp()

    // Simulate what withTerminal does: create a mock process
    const mockProc = {
      stdin: { setRawMode: vi.fn(), resume: vi.fn(), on: vi.fn() } as any,
      stdout: { write: vi.fn(), columns: 80, rows: 24, on: vi.fn() } as any,
    }

    // Apply withTerminal first (creates registry + clipboard)
    const withTerm = withTerminal(mockProc as any)(mockApp) as typeof mockApp & AppWithTerminal

    // Apply withDomEvents (should pick up existing registry)
    const enhanced = withDomEvents({ selection: true })(withTerm as any) as typeof mockApp &
      AppWithDomEvents &
      AppWithTerminal

    // The clipboard from withTerminal should be accessible via the shared registry
    const clipboard = enhanced.capabilityRegistry.get<ClipboardCapability>(CLIPBOARD_CAPABILITY)
    expect(clipboard).toBeDefined()
    expect(typeof clipboard!.copy).toBe("function")

    // The selection feature should also be in the same registry
    const selection = enhanced.capabilityRegistry.get<SelectionFeature>(SELECTION_CAPABILITY)
    expect(selection).toBe(enhanced.selectionFeature)
  })

  test("creates new registry when no existing one", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as typeof mockApp & AppWithDomEvents

    // Should still have a registry
    expect(enhanced.capabilityRegistry).toBeDefined()
    // But no clipboard (withTerminal wasn't applied)
    expect(enhanced.capabilityRegistry.get(CLIPBOARD_CAPABILITY)).toBeUndefined()
  })
})
