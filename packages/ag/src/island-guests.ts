/**
 * Silvery built-in IslandGuest implementations.
 *
 * Layer-3 of the islands stack — concrete {@link IslandGuest} instances the
 * host can mount. Built-ins ship inside `@silvery/ag` so the cost-to-use is
 * one import. Heavier guests (PTY child, replay player, embedded silvery
 * sub-instance) live in their own packages — `@silvery/island-pty`,
 * `@silvery/island-replay`, etc — to keep the core package dependency-tight.
 *
 * Current built-ins:
 *
 * - `snapshotGuest(buffer | dims, options?)` — wraps a pre-built `CellBuffer`
 *   as a no-input no-modes-no-signals guest. The buffer's contents paint at
 *   each frame, mutations show up incrementally, but the host neither routes
 *   input to it nor mirrors any of its mode requests. Useful for tests,
 *   static demos, frozen frames, GIF rendering, sandbox composition.
 *
 * Future built-ins (planned, not yet shipped — see `@km/silvery/15646-islands`):
 *
 * - `sandbox(inner)` — wraps any other guest and neutralizes the 8 query
 *   families (OSC 4/10/11 + DSR 5/6 + DA1/2 + window title) so the inner
 *   guest can't probe the host terminal. The interim termless `rec --live-
 *   chrome=none` flip exists because the silvery overlay didn't have this;
 *   Phase 3 rec adoption replaces the chrome-overlay path with
 *   `<Island guest={sandbox(ptyGuest(...))}>`.
 * - `replayGuest(asciicast)` — plays an asciicast (.cast) file frame-by-frame.
 */

import type { CellBuffer } from "./viewport-types"
import { createCellBuffer, type MutableCellBuffer } from "./viewport-buffer"
import type { Cell } from "./types"
import type {
  IslandGuest,
  IslandHandle,
  IslandOutputOwner,
  IslandSignal,
  IslandSizeOwner,
} from "./island-types"

// ============================================================================
// snapshotGuest
// ============================================================================

/**
 * Options for {@link snapshotGuest}.
 */
export interface SnapshotGuestOptions {
  /**
   * If provided, the snapshot is built from this buffer directly. The guest
   * keeps a reference to the buffer; mutations the caller makes (via
   * MutableCellBuffer.setCell) flow into the island's next render frame.
   *
   * Mutually exclusive with `cells`.
   */
  buffer?: CellBuffer | MutableCellBuffer
  /**
   * If provided, the snapshot is built by filling a new buffer with this
   * cell-grid layout. `cells[row][col]` is the cell at that position.
   * Out-of-grid cells default to the empty cell (space, no styling).
   *
   * Mutually exclusive with `buffer`.
   */
  cells?: ReadonlyArray<ReadonlyArray<Cell | string>>
  /**
   * Explicit cols × rows. If both `buffer` and `cells` are omitted, the guest
   * creates an empty buffer at these dimensions (useful when the caller plans
   * to populate via the returned handle's IslandOutputOwner.writeCells).
   */
  cols?: number
  rows?: number
}

/**
 * The handle returned by a snapshotGuest after `init()` — augments the base
 * {@link IslandHandle} with a `setBuffer()` escape hatch for swap-the-whole-
 * frame use cases (GIF playback, scrub-to-frame).
 */
export interface SnapshotGuestHandle extends IslandHandle {
  /**
   * Replace the guest's buffer entirely. Notifies subscribers so the host
   * re-blits on the next frame. The new buffer's dimensions must match the
   * island's current `cols × rows` (resize the island via the host first if
   * dims change — see `IslandSizeOwner.requestResize`).
   */
  setBuffer(buffer: CellBuffer): void
}

/**
 * Build a snapshot-style {@link IslandGuest}.
 *
 * Three input modes:
 *   - Pre-built buffer:  `snapshotGuest({ buffer })`
 *   - Cell-grid literal: `snapshotGuest({ cells: [[cell, cell], [cell, cell]] })`
 *   - Empty dims:        `snapshotGuest({ cols: 80, rows: 24 })`
 *
 * The guest exposes no input, no modes, no signals — it's pure cell content.
 * Capabilities = `{}` (host won't try to route input or surface mode requests).
 *
 * The returned guest's `init()` is synchronous internally; the factory's
 * `Promise.resolve()` hop still applies (per the /pro-decided contract that
 * `init()` returns Promise externally).
 *
 * @example
 * ```ts
 * const guest = snapshotGuest({ cols: 80, rows: 24 })
 * <Island guest={guest} cols={80} rows={24} />
 * // Later: mutate the buffer to update the displayed frame.
 * const handle = (await guest.init(ctx)) as SnapshotGuestHandle
 * handle.output.buffer.setCell(0, 0, { char: "X", fg: null, bg: null, ... })
 * handle.output.invalidateAll()  // trigger re-blit on next frame
 * ```
 */
export function snapshotGuest(options: SnapshotGuestOptions): IslandGuest {
  const buffer = resolveBuffer(options)
  return {
    // Snapshot guests declare no capabilities — host never routes input,
    // never surfaces mode requests, never asks for resize ack (the buffer
    // dimensions are fixed at construction; resize requires building a new
    // guest with the new dims).
    capabilities: undefined,
    async init(ctx) {
      const cols = buffer.cols
      const rows = buffer.rows
      const subscribers = new Set<() => void>()

      const size: IslandSizeOwner = {
        get cols() {
          return cols
        },
        get rows() {
          return rows
        },
        subscribe(listener: (size: { cols: number; rows: number }) => void): () => void {
          // Snapshot guest never resizes — return a no-op unsubscriber.
          // The host may call requestResize, but the guest ignores it; the
          // host reads cols/rows back and finds them unchanged.
          void listener
          return () => {}
        },
        requestResize(_nextCols: number, _nextRows: number): void {
          // Ignore. The guest's buffer dimensions are immutable; the host's
          // attempt to resize is recorded but produces no acknowledgement.
        },
      }

      let activeBuffer = buffer

      const output: IslandOutputOwner = {
        get buffer() {
          return activeBuffer
        },
        cursor: null,
        cursorVisible: false,
        subscribe(listener: () => void): () => void {
          subscribers.add(listener)
          return () => {
            subscribers.delete(listener)
          }
        },
        writeCells(): void {
          // No-op for snapshot — the caller is expected to mutate the
          // underlying MutableCellBuffer directly. The convenience of a
          // writeCells delta API isn't useful here.
        },
        invalidateAll(): void {
          for (const cb of subscribers) cb()
        },
      }

      // Snapshot guests don't really have a meaningful "ready" lifecycle —
      // the buffer is populated at construction. We still emit `ready` so
      // observers get the normal lifecycle signal.
      ctx.emit({ type: "ready" } satisfies IslandSignal)

      const handle: SnapshotGuestHandle = {
        size,
        output,
        dispose() {
          // Drop subscribers so the host's last-frame paint doesn't leak
          // into a later render cycle.
          subscribers.clear()
        },
        setBuffer(next: CellBuffer): void {
          if (next.cols !== activeBuffer.cols || next.rows !== activeBuffer.rows) {
            throw new Error(
              `snapshotGuest: setBuffer dims mismatch — current ${activeBuffer.cols}×${activeBuffer.rows}, ` +
                `new ${next.cols}×${next.rows}. Build a new guest for different dims.`,
            )
          }
          activeBuffer = next
          for (const cb of subscribers) cb()
        },
      }
      return handle
    },
  }
}

// ============================================================================
// Internal — resolve options to a CellBuffer
// ============================================================================

function resolveBuffer(options: SnapshotGuestOptions): CellBuffer | MutableCellBuffer {
  const { buffer, cells, cols, rows } = options
  // Reject the impossible combinations early — the type system can't fully
  // express "exactly one of {buffer, cells, dims-only}" but we can catch it
  // at runtime with a clear message.
  const provided = [buffer, cells].filter((x) => x != null).length
  if (provided > 1) {
    throw new Error("snapshotGuest: pass at most one of `buffer` or `cells`.")
  }

  if (buffer) return buffer
  if (cells) return buildBufferFromCells(cells, cols, rows)

  // dims-only path
  if (cols == null || rows == null) {
    throw new Error("snapshotGuest: requires one of `buffer`, `cells`, or both `cols`+`rows`.")
  }
  return createCellBuffer(cols, rows)
}

function buildBufferFromCells(
  cells: ReadonlyArray<ReadonlyArray<Cell | string>>,
  colsOverride?: number,
  rowsOverride?: number,
): MutableCellBuffer {
  const rows = rowsOverride ?? cells.length
  const cols = colsOverride ?? cells[0]?.length ?? 0
  const buf = createCellBuffer(cols, rows)
  for (let r = 0; r < rows && r < cells.length; r++) {
    const row = cells[r]
    if (!row) continue
    for (let c = 0; c < cols && c < row.length; c++) {
      const entry = row[c]
      if (entry === undefined) continue
      buf.setCell(c, r, typeof entry === "string" ? makeStringCell(entry) : entry)
    }
  }
  return buf
}

function makeStringCell(char: string): Cell {
  return {
    char,
    fg: null,
    bg: null,
    attrs: {},
    wide: false,
    continuation: false,
  }
}
