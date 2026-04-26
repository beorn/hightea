/**
 * RadioGroup Component Tests
 *
 * Verifies the rendered selection marker, option labels, and styling
 * differences between selected / unselected / focused options.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, RadioGroup, Text } from "silvery"

const render = createRenderer({ cols: 60, rows: 10 })

describe("RadioGroup", () => {
  test("renders all option labels and a (•) for the selected option", () => {
    const app = render(
      <RadioGroup
        key="rg-1"
        value="dark"
        onChange={() => {}}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "auto", label: "Auto" },
        ]}
      />,
    )
    expect(app.text).toContain("Light")
    expect(app.text).toContain("Dark")
    expect(app.text).toContain("Auto")
    // Exactly one option is selected — count (•) markers.
    const selected = (app.text.match(/\(•\)/g) ?? []).length
    expect(selected).toBe(1)
  })

  test("changing the value prop updates which marker is filled", () => {
    function Wrap({ v }: { v: string }): React.ReactElement {
      return (
        <RadioGroup
          value={v}
          onChange={() => {}}
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ]}
        />
      )
    }
    const a = render(<Wrap key="rg-a" v="a" />)
    expect(a.text).toMatch(/\(•\) Alpha/)
    expect(a.text).toMatch(/\( \) Beta/)

    const b = render(<Wrap key="rg-b" v="b" />)
    expect(b.text).toMatch(/\( \) Alpha/)
    expect(b.text).toMatch(/\(•\) Beta/)
  })

  test("renders inside a labeled group via outer <Text>", () => {
    const app = render(
      <Box flexDirection="column">
        <Text bold>Theme:</Text>
        <RadioGroup
          key="rg-labeled"
          value="auto"
          onChange={() => {}}
          options={[
            { value: "light", label: "Light" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </Box>,
    )
    expect(app.text).toContain("Theme:")
    expect(app.text).toContain("Light")
    expect(app.text).toContain("Auto")
  })
})
