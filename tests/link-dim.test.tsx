/**
 * Tests that the Link component's `dim` prop correctly applies dim styling
 * alongside underline and color, without requiring a nested <Text dim>.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Link } from "../src/components/Link.js"
import { createRenderer } from "@hightea/term/testing"

describe("Link dim prop", () => {
  const render = createRenderer({ cols: 40, rows: 3 })

  test("renders link text with dim and underline when dim prop is set", () => {
    const app = render(
      <Link href="https://example.com" color="cyan" dim>
        example.com
      </Link>,
    )
    expect(app.text).toContain("example.com")
    // The ANSI output should contain dim (SGR 2) and underline (SGR 4)
    expect(app.ansi).toMatch(/\x1b\[[^m]*2[^m]*m/) // dim
    expect(app.ansi).toMatch(/\x1b\[[^m]*4[^m]*m/) // underline
  })

  test("renders link text without dim when dim prop is not set", () => {
    const app = render(
      <Link href="https://example.com" color="cyan">
        example.com
      </Link>,
    )
    expect(app.text).toContain("example.com")
    // Should have underline but not dim
    expect(app.ansi).toMatch(/\x1b\[[^m]*4[^m]*m/) // underline
    // SGR 2 is dim — should not appear
    expect(app.ansi).not.toMatch(/\x1b\[2m/)
  })

  test("dim=false does not apply dim styling", () => {
    const app = render(
      <Link href="https://example.com" color="cyan" dim={false}>
        example.com
      </Link>,
    )
    expect(app.text).toContain("example.com")
    expect(app.ansi).not.toMatch(/\x1b\[2m/)
  })
})
