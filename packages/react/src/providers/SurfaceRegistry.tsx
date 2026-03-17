/**
 * SurfaceRegistry — tracks mounted TextSurfaces for app-global search + selection.
 *
 * Internal provider. Components register their TextSurface on mount and
 * unregister on unmount. SearchProvider and SelectionProvider use the
 * registry to find the right surface to operate on.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef } from "react"
import type { TextSurface } from "@silvery/term/text-surface"
import type { ReactNode, ReactElement } from "react"

// ============================================================================
// Types
// ============================================================================

export interface SurfaceRegistryValue {
  /** Register a surface. Call on mount. */
  register(surface: TextSurface): void
  /** Unregister a surface by id. Call on unmount. */
  unregister(id: string): void
  /** Get a surface by id, or null if not registered. */
  getSurface(id: string): TextSurface | null
  /** Get the currently focused surface, or null. */
  getFocusedSurface(): TextSurface | null
  /** Get all registered surfaces. */
  getAllSurfaces(): TextSurface[]
  /** Set the focused surface by id (null to clear). */
  setFocused(id: string | null): void
}

// ============================================================================
// Context
// ============================================================================

const SurfaceRegistryContext = createContext<SurfaceRegistryValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function SurfaceRegistryProvider({ children }: { children: ReactNode }): ReactElement {
  const surfacesRef = useRef(new Map<string, TextSurface>())
  const focusedRef = useRef<string | null>(null)

  const register = useCallback((surface: TextSurface) => {
    surfacesRef.current.set(surface.id, surface)
  }, [])

  const unregister = useCallback((id: string) => {
    surfacesRef.current.delete(id)
    if (focusedRef.current === id) {
      focusedRef.current = null
    }
  }, [])

  const getSurface = useCallback((id: string): TextSurface | null => {
    return surfacesRef.current.get(id) ?? null
  }, [])

  const getFocusedSurface = useCallback((): TextSurface | null => {
    if (!focusedRef.current) return null
    return surfacesRef.current.get(focusedRef.current) ?? null
  }, [])

  const getAllSurfaces = useCallback((): TextSurface[] => {
    return Array.from(surfacesRef.current.values())
  }, [])

  const setFocused = useCallback((id: string | null) => {
    focusedRef.current = id
  }, [])

  const value = useMemo<SurfaceRegistryValue>(
    () => ({ register, unregister, getSurface, getFocusedSurface, getAllSurfaces, setFocused }),
    [register, unregister, getSurface, getFocusedSurface, getAllSurfaces, setFocused],
  )

  return React.createElement(SurfaceRegistryContext.Provider, { value }, children)
}

// ============================================================================
// Hook
// ============================================================================

export function useSurfaceRegistry(): SurfaceRegistryValue {
  const ctx = useContext(SurfaceRegistryContext)
  if (!ctx) {
    throw new Error("useSurfaceRegistry must be used within a SurfaceRegistryProvider")
  }
  return ctx
}
