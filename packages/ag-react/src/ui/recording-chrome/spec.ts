export const RECORDING_CHROME_STYLES = ["none", "macos", "windows"] as const

export type RecordingChromeStyle = (typeof RECORDING_CHROME_STYLES)[number]
export type RecordingChromeAlignment = "center" | "left"
export type RecordingChromeBorderStyle = "round" | "single" | "none"
export type RecordingChromeControlSide = "left" | "right"
export type RecordingChromeSvgWindowBar = "none" | "rings" | "colorful" | "windows"

export interface RecordingChromeOverhead {
  cols: number
  rows: number
}

export interface RecordingChromeControl {
  glyph: string
  color?: string
}

export interface RecordingChromeTitleBarSpec {
  controlsSide: RecordingChromeControlSide
  controls: readonly RecordingChromeControl[]
  separator: string | null
}

export interface RecordingChromeLiveSpec {
  borderStyle: RecordingChromeBorderStyle
  titleBar: RecordingChromeTitleBarSpec | null
}

export interface RecordingChromeSvgSpec {
  windowBar: RecordingChromeSvgWindowBar
  windowBarSize: number
  padding: number
  borderRadius: number
  margin: number
  shadow: number
  contentOffset: { x: number; y: number }
}

export interface RecordingChromeSpec {
  style: RecordingChromeStyle
  title: string
  alignment: RecordingChromeAlignment
  hasChrome: boolean
  overhead: RecordingChromeOverhead
  live: RecordingChromeLiveSpec
  svg: RecordingChromeSvgSpec
}

export interface ComposeRecordingChromeSpecOptions {
  style?: RecordingChromeStyle
  title?: string
  alignment?: RecordingChromeAlignment
}

export interface RecordingChromeSvgOptions {
  windowBar?: RecordingChromeSvgWindowBar
  windowBarSize?: number
  padding?: number
  borderRadius?: number
  margin?: number
  shadow?: number
  windowTitle?: string
}

const MACOS_CONTROLS: readonly RecordingChromeControl[] = [
  { glyph: "●", color: "red" },
  { glyph: "●", color: "yellow" },
  { glyph: "●", color: "green" },
]

const WINDOWS_CONTROLS: readonly RecordingChromeControl[] = [
  { glyph: "−", color: "$fg-muted" },
  { glyph: "□", color: "$fg-muted" },
  { glyph: "×", color: "red" },
]

export function recordingChromeOverhead(style: RecordingChromeStyle): RecordingChromeOverhead {
  switch (style) {
    case "macos":
    case "windows":
      return { cols: 2, rows: 5 }
    case "none":
    default:
      return { cols: 0, rows: 2 }
  }
}

export function composeRecordingChromeSpec(
  options: ComposeRecordingChromeSpecOptions = {},
): RecordingChromeSpec {
  const style = options.style ?? "macos"
  const title = options.title ?? ""
  const alignment = options.alignment ?? "center"

  switch (style) {
    case "macos": {
      const padding = 28
      const margin = 24
      const windowBarSize = 38
      return {
        style,
        title,
        alignment,
        hasChrome: true,
        overhead: recordingChromeOverhead(style),
        live: {
          borderStyle: "round",
          titleBar: {
            controlsSide: "left",
            controls: MACOS_CONTROLS,
            separator: "·",
          },
        },
        svg: {
          windowBar: "colorful",
          windowBarSize,
          padding,
          borderRadius: 10,
          margin,
          shadow: 14,
          contentOffset: { x: margin + padding, y: margin + padding + windowBarSize },
        },
      }
    }
    case "windows": {
      const padding = 24
      const margin = 0
      const windowBarSize = 34
      return {
        style,
        title,
        alignment,
        hasChrome: true,
        overhead: recordingChromeOverhead(style),
        live: {
          borderStyle: "single",
          titleBar: {
            controlsSide: "right",
            controls: WINDOWS_CONTROLS,
            separator: null,
          },
        },
        svg: {
          windowBar: "windows",
          windowBarSize,
          padding,
          borderRadius: 0,
          margin,
          shadow: 0,
          contentOffset: { x: margin + padding, y: margin + padding + windowBarSize },
        },
      }
    }
    case "none":
    default:
      return {
        style: "none",
        title,
        alignment,
        hasChrome: false,
        overhead: recordingChromeOverhead("none"),
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
      }
  }
}

export function recordingChromeSpecToSvgOptions(
  spec: RecordingChromeSpec,
): RecordingChromeSvgOptions {
  if (!spec.hasChrome) return {}
  const options: RecordingChromeSvgOptions = {
    windowBar: spec.svg.windowBar,
    windowBarSize: spec.svg.windowBarSize,
    padding: spec.svg.padding,
    borderRadius: spec.svg.borderRadius,
    ...(spec.title ? { windowTitle: spec.title } : {}),
  }
  if (spec.svg.margin > 0) options.margin = spec.svg.margin
  if (spec.svg.shadow > 0) options.shadow = spec.svg.shadow
  return options
}
