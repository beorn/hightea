/**
 * Shared tree utilities for silvery event systems.
 *
 * Functions used by both focus-events.ts and mouse-events.ts.
 */

import type { AgNode, Rect } from "./types.js"

/**
 * Collect the ancestor path from target to root (inclusive).
 */
export function getAncestorPath(node: AgNode): AgNode[] {
  const path: AgNode[] = []
  let current: AgNode | null = node
  while (current) {
    path.push(current)
    current = current.parent
  }
  return path
}

/**
 * Check if a point is inside a rect.
 */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}
