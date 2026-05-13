/**
 * Layout Engine Abstraction
 *
 * Provides a pluggable interface for layout engines (Yoga, Flexily, etc.)
 * This allows silvery to use different layout backends without code changes.
 *
 * Core type interfaces (LayoutNode, MeasureFunc, MeasureMode) live in
 * @silvery/ag/layout-types. This file contains the runtime engine management.
 */

import type { LayoutNode } from "@silvery/ag/layout-types"

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Branded types prevent accidentally mixing up layout constant categories.
 * E.g., you can't pass an AlignValue where a FlexDirectionValue is expected.
 */
export type FlexDirectionValue = number & { readonly __brand: "FlexDirection" }
export type WrapValue = number & { readonly __brand: "Wrap" }
export type AlignValue = number & { readonly __brand: "Align" }
export type JustifyValue = number & { readonly __brand: "Justify" }
export type EdgeValue = number & { readonly __brand: "Edge" }
export type GutterValue = number & { readonly __brand: "Gutter" }
export type DisplayValue = number & { readonly __brand: "Display" }
export type PositionTypeValue = number & { readonly __brand: "PositionType" }
export type OverflowValue = number & { readonly __brand: "Overflow" }
export type DirectionValue = number & { readonly __brand: "Direction" }
export type MeasureModeValue = number & { readonly __brand: "MeasureMode" }

// ============================================================================
// Layout Constants Interface
// ============================================================================

/**
 * Constants for layout configuration.
 * These are the same across Yoga and Flexily.
 * Uses branded types for compile-time safety.
 */
export interface LayoutConstants {
  // Flex Direction
  FLEX_DIRECTION_COLUMN: FlexDirectionValue
  FLEX_DIRECTION_COLUMN_REVERSE: FlexDirectionValue
  FLEX_DIRECTION_ROW: FlexDirectionValue
  FLEX_DIRECTION_ROW_REVERSE: FlexDirectionValue

  // Wrap
  WRAP_NO_WRAP: WrapValue
  WRAP_WRAP: WrapValue
  WRAP_WRAP_REVERSE: WrapValue

  // Align
  ALIGN_AUTO: AlignValue
  ALIGN_FLEX_START: AlignValue
  ALIGN_CENTER: AlignValue
  ALIGN_FLEX_END: AlignValue
  ALIGN_STRETCH: AlignValue
  ALIGN_BASELINE: AlignValue
  ALIGN_SPACE_BETWEEN: AlignValue
  ALIGN_SPACE_AROUND: AlignValue
  ALIGN_SPACE_EVENLY: AlignValue

  // Justify
  JUSTIFY_FLEX_START: JustifyValue
  JUSTIFY_CENTER: JustifyValue
  JUSTIFY_FLEX_END: JustifyValue
  JUSTIFY_SPACE_BETWEEN: JustifyValue
  JUSTIFY_SPACE_AROUND: JustifyValue
  JUSTIFY_SPACE_EVENLY: JustifyValue

  // Edge
  EDGE_LEFT: EdgeValue
  EDGE_TOP: EdgeValue
  EDGE_RIGHT: EdgeValue
  EDGE_BOTTOM: EdgeValue
  EDGE_HORIZONTAL: EdgeValue
  EDGE_VERTICAL: EdgeValue
  EDGE_ALL: EdgeValue

  // Gutter
  GUTTER_COLUMN: GutterValue
  GUTTER_ROW: GutterValue
  GUTTER_ALL: GutterValue

  // Display
  DISPLAY_FLEX: DisplayValue
  DISPLAY_NONE: DisplayValue

  // Position Type
  POSITION_TYPE_STATIC: PositionTypeValue
  POSITION_TYPE_RELATIVE: PositionTypeValue
  POSITION_TYPE_ABSOLUTE: PositionTypeValue

  // Overflow
  OVERFLOW_VISIBLE: OverflowValue
  OVERFLOW_HIDDEN: OverflowValue
  OVERFLOW_SCROLL: OverflowValue

  // Direction
  DIRECTION_LTR: DirectionValue

  // Measure Mode
  MEASURE_MODE_UNDEFINED: MeasureModeValue
  MEASURE_MODE_EXACTLY: MeasureModeValue
  MEASURE_MODE_AT_MOST: MeasureModeValue
}

// ============================================================================
// Engine Capabilities (Phase A0.0.5 of @km/silvery/responsive-layout-architecture-reframe)
// ============================================================================

/**
 * Declares which engine-native primitives a `LayoutEngine` supports.
 *
 * silvery is engine-pluggable — `flexily` (pure JS) and `yoga` (WASM) ship as peer
 * adapters. The responsive-layout reframe (Phase A0.1+) adds engine-native container
 * queries, fitWidth, size containment, cq* units, and CSS math functions. These
 * primitives can only be implemented in `flexily` (yoga's WASM boundary doesn't expose
 * inter-pass child-style mutation).
 *
 * Each adapter declares which capabilities it supports. Consumers (`<Box fitWidth>`,
 * `<Box containerQueries>`, etc.) gate on capability presence via `requireCapability()`
 * — under yoga, those primitives THROW at first paint with a one-line fix instruction
 * (switch via `SILVERY_ENGINE=flexily`).
 */
export interface EngineCapabilities {
  /** Container queries: `<Box containerQueries={...}>` + `containerType` / `containerName` */
  readonly containerQueries: boolean
  /** Size containment: `<Box containSize>` */
  readonly containSize: boolean
  /** Container-query units in style values: `cqi`, `cqmin`, `cqb`, `cqmax` */
  readonly containerQueryUnits: boolean
  /** fitWidth Box prop: `<Box fitWidth={[80, 120, "100cqi"]}>` */
  readonly fitWidth: boolean
  /** CSS math functions in style values: `min()`, `max()`, `clamp()` */
  readonly styleMathFunctions: boolean
  /** Inter-pass child-style mutation hook (underlying mechanism for CQ + fitWidth) */
  readonly childStyleMutation: boolean
}

// ============================================================================
// Layout Engine Interface
// ============================================================================

/**
 * Abstract layout engine interface.
 * Implementations can wrap Yoga, Flexily, or other layout engines.
 */
export interface LayoutEngine {
  /** Create a new layout node */
  createNode(): LayoutNode

  /** Layout constants for this engine */
  readonly constants: LayoutConstants

  /** Engine name for debugging */
  readonly name: string

  /** Which engine-native primitives this adapter supports (Phase A0.0.5+). */
  readonly capabilities: EngineCapabilities
}

// ============================================================================
// Global Layout Engine Management
// ============================================================================

let layoutEngine: LayoutEngine | null = null

/**
 * Set the global layout engine instance.
 * Must be called before rendering.
 */
export function setLayoutEngine(engine: LayoutEngine): void {
  layoutEngine = engine
}

/**
 * Get the global layout engine instance.
 * Throws if not initialized.
 */
export function getLayoutEngine(): LayoutEngine {
  if (!layoutEngine) {
    throw new Error(
      "Layout engine not initialized. Call setLayoutEngine() or initYoga()/initFlexily() first.",
    )
  }
  return layoutEngine
}

/**
 * Check if a layout engine is initialized.
 */
export function isLayoutEngineInitialized(): boolean {
  return layoutEngine !== null
}

/**
 * Get the layout constants from the current engine.
 * Convenience function for accessing constants.
 */
export function getConstants(): LayoutConstants {
  return getLayoutEngine().constants
}

/**
 * Runtime guard: throws if the active layout engine doesn't advertise the named capability.
 *
 * Used by Phase A0.1+ primitives (`<Box fitWidth>`, `<Box containerQueries>`, cq* units,
 * style math functions) at their first-paint resolution path. Under `yoga` (or pre-A0.1
 * flexily), the throw happens at first paint with a one-line fix instruction in the error
 * message. No silent fallback — silent fallback under yoga would look like a fresh render
 * bug and cost hours of debugging.
 *
 * @param name     The capability key being checked (e.g. `"fitWidth"`, `"containerQueries"`).
 * @param consumer A human-readable label for the call site, e.g. `"<Box fitWidth>"` or
 *                 `"cqi unit in 'padding'"`. Surfaces in the error message.
 */
export function requireCapability(name: keyof EngineCapabilities, consumer: string): void {
  const engine = getLayoutEngine()
  if (!engine.capabilities[name]) {
    throw new Error(
      `${consumer} requires layout engine capability "${name}" — current engine "${engine.name}" doesn't support it. ` +
        `Switch to flexily: set SILVERY_ENGINE=flexily, OR call ensureDefaultLayoutEngine("flexily") before render.`,
    )
  }
}

// ============================================================================
// Default Engine Initialization
// ============================================================================

/**
 * Layout engine type for configuration.
 *
 * - 'flexily': Zero-allocation Flexily (default, optimized for high-frequency layout)
 * - 'flexily-classic': Classic Flexily algorithm (for debugging/compatibility)
 * - 'yoga': Facebook's WASM-based flexbox (most mature)
 */
export type LayoutEngineType = "flexily" | "yoga"

/**
 * Initialize the layout engine if not already set.
 *
 * @param engineType - 'flexily', 'flexily-classic', or 'yoga'. If not provided, checks
 *                     SILVERY_ENGINE env var, then defaults to 'flexily'.
 */
export async function ensureDefaultLayoutEngine(engineType?: LayoutEngineType): Promise<void> {
  if (isLayoutEngineInitialized()) {
    return
  }

  // Resolve engine type: option → env → 'flexily'
  const resolved =
    engineType ?? (process.env.SILVERY_ENGINE?.toLowerCase() as LayoutEngineType) ?? "flexily"

  if (resolved === "yoga") {
    const { initYogaEngine } = await import("./adapters/yoga-adapter.js")
    setLayoutEngine(await initYogaEngine())
  } else {
    // 'flexily' (default) uses zero-allocation engine with CSS-correct defaults
    const { createFlexilyZeroEngine } = await import("./adapters/flexily-zero-adapter.js")
    setLayoutEngine(createFlexilyZeroEngine())
  }
}
