import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "../src/components/Text"
import {
  composeRecordingChromeSpec,
  unstable_RecordingChrome as RecordingChrome,
} from "../src/ui/recording-chrome"

describe("composeRecordingChromeSpec", () => {
  test("pins macos chrome metadata for both live and SVG renderers", () => {
    expect(
      composeRecordingChromeSpec({ style: "macos", title: "Vault", alignment: "center" }),
    ).toMatchObject({
      style: "macos",
      title: "Vault",
      alignment: "center",
      hasChrome: true,
      overhead: { cols: 2, rows: 5 },
      live: {
        borderStyle: "round",
        titleBar: {
          controlsSide: "left",
        },
      },
      svg: {
        windowBar: "colorful",
        windowBarSize: 38,
        padding: 28,
        borderRadius: 10,
        margin: 24,
        shadow: 14,
        contentOffset: { x: 52, y: 90 },
      },
    })
  })

  test("none chrome is a metadata identity wrapper", () => {
    expect(composeRecordingChromeSpec({ style: "none" })).toEqual({
      style: "none",
      title: "",
      alignment: "center",
      hasChrome: false,
      overhead: { cols: 0, rows: 2 },
      live: {
        borderStyle: "none",
        titleBar: null,
      },
      svg: {
        windowBar: "none",
        windowBarSize: 0,
        padding: 0,
        borderRadius: 0,
        margin: 0,
        shadow: 0,
        contentOffset: { x: 0, y: 0 },
      },
    })
  })
})

describe("<RecordingChrome> provisional component", () => {
  test("renders shared macos live chrome around children", () => {
    const render = createRenderer({ cols: 60, rows: 12 })
    const app = render(
      <RecordingChrome chrome="macos" title="Vault" status={{ elapsed: "0:03", blinkOn: true }}>
        <Text>terminal grid</Text>
      </RecordingChrome>,
    )

    expect(app.text).toContain("REC 0:03")
    expect(app.text).toContain("Ctrl+D to stop")
    expect(app.text).toContain("Vault")
    expect(app.text).toContain("terminal grid")
    expect(app.text).toContain("●")
  })

  test("renders windows controls from the same primitive", () => {
    const render = createRenderer({ cols: 60, rows: 12 })
    const app = render(
      <RecordingChrome chrome="windows" title="demo.sh" status={false}>
        <Text>grid</Text>
      </RecordingChrome>,
    )

    expect(app.text).toContain("demo.sh")
    expect(app.text).toContain("−")
    expect(app.text).toContain("□")
    expect(app.text).toContain("×")
    expect(app.text).toContain("grid")
  })

  test("none chrome keeps the status line but omits window controls", () => {
    const render = createRenderer({ cols: 60, rows: 8 })
    const app = render(
      <RecordingChrome chrome="none" title="hidden" status={{ elapsed: "1:00", blinkOn: false }}>
        <Text>plain grid</Text>
      </RecordingChrome>,
    )

    expect(app.text).toContain("REC 1:00")
    expect(app.text).toContain("plain grid")
    expect(app.text).not.toContain("hidden")
    expect(app.text).not.toContain("×")
  })
})
