/**
 * Regression — outline post-state carrier survives across per-frame Ag instances
 *
 * Bead: km-silvery.outline-incremental-clear (P0).
 *
 * The decoration phase needs the previous frame's outline snapshots to clear
 * stale outline cells before drawing new ones. Snapshots live on a
 * `RenderPostState` carrier that is owned by `createAg`. The test renderer
 * (`@silvery/test` → `@silvery/ag-term/renderer.ts`) creates a FRESH `Ag`
 * per `runPipeline()` call, so an Ag-internal carrier would be empty every
 * frame and `clearPreviousOutlines` would never find prior snapshots — stale
 * outline pixels would leak through the cloned `prevBuffer`.
 *
 * The fix exposes `postState` on `AgRenderOptions` / `AgRenderResult` and has
 * the renderer (and scheduler) hold the carrier alongside `prevBuffer` at
 * the instance level, passing it back in every frame so the snapshots
 * survive the per-frame Ag recycle.
 *
 * This test pins the carrier-survival contract end-to-end, exercising both
 * the parent-edge geometry that originally tripped STRICT
 * (km-silvery.outline-incremental-clear) and several toggle / migration
 * sequences that stress the snapshot lifecycle. SILVERY_STRICT=1 (default
 * in vitest) verifies incremental === fresh after every frame.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("regression: outline post-state carrier survives per-frame Ag recycle", () => {
  test("parent-outline-with-dirty-child shape — outline at parent edge clears on toggle off", () => {
    // Reproduces km-silvery.outline-incremental-clear: child fills parent
    // width, outline corner sits at x=0 (one cell outside the inner content
    // area). On `outlined=false`, the prev buffer carries the outline
    // glyph at (0,1) — the post-state carrier must hold the snapshot from
    // the previous frame so `clearPreviousOutlines` can restore the cell.
    const render = createRenderer({ cols: 50, rows: 15 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box id="grandparent" flexDirection="column" width={50} height={15}>
          <Box id="parent" flexDirection="column" width={41} paddingLeft={1} paddingTop={2}>
            <Box
              id="card"
              width={40}
              height={3}
              outlineStyle={outlined ? "round" : undefined}
              outlineColor="yellow"
            >
              <Text>Card content</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={true} />)
    expect(app.text).toContain("Card content")
    // Toggle off — snapshots from frame 1 must restore the parent-edge cell.
    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("Card content")
    // Toggle back on — snapshot for the now-empty cell must be captured
    // again so the next toggle-off works.
    app.rerender(<App outlined={true} />)
    expect(app.text).toContain("Card content")
    app.rerender(<App outlined={false} />)
    expect(app.text).toContain("Card content")
  })

  test("snapshot lifecycle — twenty toggle cycles never leak nor lose snapshots", () => {
    // On/off oscillation is the worst case for the carrier: every odd
    // frame writes snapshots (outline drawn), every even frame consumes
    // them (outline removed) AND writes an empty list. If the carrier is
    // not the same reference across frames, either:
    //   - odd frames lose their snapshots → stale cells leak forever, or
    //   - even frames see no snapshots → STRICT diverges immediately.
    const render = createRenderer({ cols: 30, rows: 16 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" padding={1} gap={2} width={30} height={16}>
          <Box outlineStyle={outlined ? "round" : undefined} width={10} height={3}>
            <Text>One</Text>
          </Box>
          <Box width={10} height={3}>
            <Text>Two</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={false} />)
    for (let i = 0; i < 20; i++) {
      app.rerender(<App outlined={true} />)
      expect(app.text).toContain("One")
      app.rerender(<App outlined={false} />)
      expect(app.text).toContain("One")
    }
  })

  test("outline migration across siblings — old position must clear when outline moves", () => {
    // The outline moves between two siblings each frame. On the migration
    // frame the previous-sibling's outline snapshots must be applied
    // (clearing the old outline) BEFORE the new sibling's outline is
    // drawn. Without the carrier survival, the prev frame's outline is
    // never cleared and STRICT diverges at the old corner.
    const render = createRenderer({ cols: 30, rows: 14 })

    function App({ cursor }: { cursor: "a" | "b" }) {
      return (
        <Box flexDirection="column" padding={1} gap={1}>
          <Box outlineStyle={cursor === "a" ? "single" : undefined} width={10} height={3}>
            <Text>Item A</Text>
          </Box>
          <Box outlineStyle={cursor === "b" ? "single" : undefined} width={10} height={3}>
            <Text>Item B</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App cursor="a" />)
    for (let i = 0; i < 5; i++) {
      app.rerender(<App cursor="b" />)
      expect(app.text).toContain("Item B")
      app.rerender(<App cursor="a" />)
      expect(app.text).toContain("Item A")
    }
  })
})
