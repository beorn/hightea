/**
 * Badge + Toast variant surface (Sterling Phase 2b).
 *
 * Covers the `variant` surface for status-bearing components:
 *   - accent / error / warning / success / info
 *   - destructive (intent alias for error — D1)
 *   - primary (legacy synonym accepted during 2b/2c)
 *
 * Each variant must resolve to the matching Sterling flat token on the Text
 * node's `color` prop. No visual render assertion — the prop itself is
 * the public contract and the pipeline test passes stress it further.
 *
 * Refs: hub/silvery/design/v10-terminal/design-system.md §"Intent vs role"
 *       hub/silvery/design/v10-terminal/sterling-preflight.md (D1)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { StyleProps } from "@silvery/ag/types"
import { Badge } from "../../packages/ag-react/src/ui/components/Badge"
import { ToastItem } from "../../packages/ag-react/src/ui/components/Toast"

const render = createRenderer({ cols: 80, rows: 24 })

function colorOf(text: string, app: ReturnType<typeof render>): string | undefined {
  const node = app.getByText(text).resolve()
  return (node?.props as StyleProps | undefined)?.color as string | undefined
}

describe("Badge variant surface", () => {
  const cases: Array<[string, string]> = [
    ["default", "$fg"],
    ["accent", "$fg-accent"],
    ["error", "$fg-error"],
    ["warning", "$fg-warning"],
    ["success", "$fg-success"],
    ["info", "$fg-info"],
    ["destructive", "$fg-error"],
    ["primary", "$fg-accent"], // legacy synonym for accent
  ]

  for (const [variant, expected] of cases) {
    test(`variant="${variant}" → ${expected}`, () => {
      const label = `T-${variant}`
      const app = render(<Badge label={label} variant={variant as never} />)
      expect(colorOf(label, app)).toBe(expected)
    })
  }

  test("variant defaults to 'default' when omitted", () => {
    const app = render(<Badge label="bare" />)
    expect(colorOf("bare", app)).toBe("$fg")
  })

  test("explicit color prop overrides variant mapping", () => {
    const app = render(<Badge label="override" variant="error" color="#ff00ff" />)
    expect(colorOf("override", app)).toBe("#ff00ff")
  })
})

describe("Toast variant surface", () => {
  const cases: Array<[string, string, string]> = [
    // [variant, expected Sterling token, icon glyph]
    ["default", "$fg", "i"],
    ["accent", "$fg-accent", "*"],
    ["success", "$fg-success", "+"],
    ["error", "$fg-error", "x"],
    ["warning", "$fg-warning", "!"],
    ["info", "$fg-info", "i"],
    ["destructive", "$fg-error", "x"],
  ]

  for (const [variant, expected, icon] of cases) {
    test(`variant="${variant}" icon → ${expected}`, () => {
      const app = render(
        <ToastItem
          toast={{
            id: `t-${variant}`,
            title: `title-${variant}`,
            variant: variant as never,
            duration: 0,
          }}
        />,
      )
      // Toast renders the icon as `[<glyph>]`. Locate that node and check its
      // color prop — the icon is the only Text that carries the variant color.
      const node = app.getByText(`[${icon}]`).resolve()
      expect(node, `could not find icon [${icon}] for variant ${variant}`).not.toBeNull()
      expect((node!.props as StyleProps).color).toBe(expected)
    })
  }
})
