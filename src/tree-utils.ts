/**
 * Shared tree utilities for inkx event systems.
 *
 * Functions used by both focus-events.ts and mouse-events.ts.
 */

import type { InkxNode, Rect } from "./types.js"

/**
 * Collect the ancestor path from target to root (inclusive).
 */
export function getAncestorPath(node: InkxNode): InkxNode[] {
  const path: InkxNode[] = []
  let current: InkxNode | null = node
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
