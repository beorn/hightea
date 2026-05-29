import {
  recordingChromeSvgLayout,
  type RecordingChromeSpec,
  type RecordingChromeSvgWindowBar,
} from "./spec"

export interface ComposeRecordingChromeSvgOptions {
  spec?: RecordingChromeSpec
  windowBar?: RecordingChromeSvgWindowBar
  barWidth: number
  barHeight?: number
  borderRadius?: number
  themeBackground: string
  title?: string | null
  fontSize?: number
}

interface RGB {
  r: number
  g: number
  b: number
}

function coord(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function rgbToHex(color: RGB): string {
  const r = color.r.toString(16).padStart(2, "0")
  const g = color.g.toString(16).padStart(2, "0")
  const b = color.b.toString(16).padStart(2, "0")
  return `#${r}${g}${b}`
}

function parseHex(color: string): RGB | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function luminance(c: RGB): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
}

function deriveBarColor(themeBg: string): string {
  const rgb = parseHex(themeBg)
  if (!rgb) return "#333333"
  const dark = luminance(rgb) < 0.5
  const shift = dark ? 28 : -28
  const clamp = (v: number) => Math.max(0, Math.min(255, v + shift))
  return rgbToHex({ r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) })
}

function titleColorFor(barColor: string): string {
  const rgb = parseHex(barColor)
  if (!rgb) return "#cccccc"
  return luminance(rgb) < 0.5 ? "#cccccc" : "#333333"
}

export function composeRecordingChromeSvg(options: ComposeRecordingChromeSvgOptions): string[] {
  const specLayout = options.spec ? recordingChromeSvgLayout(options.spec) : null
  const windowBar = specLayout?.windowBar ?? options.windowBar ?? "none"
  if (windowBar === "none") return []

  const barWidth = options.barWidth
  const barHeight = options.barHeight ?? specLayout?.windowBarSize ?? 40
  const borderRadius = options.borderRadius ?? specLayout?.borderRadius ?? 0
  const themeBg = options.themeBackground
  const title = options.title ?? options.spec?.title ?? null
  const fontSize = options.fontSize ?? 16

  const titleFontSize = Math.max(13, Math.min(fontSize, Math.round(barHeight * 0.5)))
  const parts: string[] = []
  const barColor = deriveBarColor(themeBg)

  parts.push(
    `<rect width="${coord(barWidth)}" height="${coord(barHeight)}" rx="${coord(borderRadius)}" ry="${coord(borderRadius)}" fill="${barColor}"/>`,
  )
  if (borderRadius > 0) {
    parts.push(
      `<rect y="${coord(barHeight - borderRadius)}" width="${coord(barWidth)}" height="${coord(borderRadius)}" fill="${barColor}"/>`,
    )
  }

  const titleColor = titleColorFor(barColor)

  if (windowBar === "windows") {
    const slot = 46
    const glyphSize = 10
    const cy = barHeight / 2
    const closeX = barWidth - slot / 2
    const maxX = barWidth - slot * 1.5
    const minX = barWidth - slot * 2.5
    const half = glyphSize / 2
    parts.push(
      `<line x1="${coord(minX - half)}" y1="${coord(cy)}" x2="${coord(minX + half)}" y2="${coord(cy)}" stroke="${titleColor}" stroke-width="1.4"/>`,
    )
    parts.push(
      `<rect x="${coord(maxX - half)}" y="${coord(cy - half)}" width="${glyphSize}" height="${glyphSize}" fill="none" stroke="${titleColor}" stroke-width="1.4"/>`,
    )
    parts.push(
      `<line x1="${coord(closeX - half)}" y1="${coord(cy - half)}" x2="${coord(closeX + half)}" y2="${coord(cy + half)}" stroke="#e81123" stroke-width="1.6"/>`,
    )
    parts.push(
      `<line x1="${coord(closeX - half)}" y1="${coord(cy + half)}" x2="${coord(closeX + half)}" y2="${coord(cy - half)}" stroke="#e81123" stroke-width="1.6"/>`,
    )
    if (title) {
      parts.push(
        `<text x="14" y="${coord(cy)}" font-size="${titleFontSize}" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" fill="${titleColor}" dominant-baseline="central">${escapeXml(title)}</text>`,
      )
    }
    return parts
  }

  const dotRadius = 6
  const dotY = barHeight / 2
  const dotStartX = 20

  if (windowBar === "rings") {
    parts.push(
      `<circle cx="${dotStartX}" cy="${coord(dotY)}" r="${dotRadius}" fill="none" stroke="#ff5f57" stroke-width="1.5"/>`,
    )
    parts.push(
      `<circle cx="${dotStartX + 20}" cy="${coord(dotY)}" r="${dotRadius}" fill="none" stroke="#febc2e" stroke-width="1.5"/>`,
    )
    parts.push(
      `<circle cx="${dotStartX + 40}" cy="${coord(dotY)}" r="${dotRadius}" fill="none" stroke="#28c840" stroke-width="1.5"/>`,
    )
  } else {
    parts.push(`<circle cx="${dotStartX}" cy="${coord(dotY)}" r="${dotRadius}" fill="#ff5f57"/>`)
    parts.push(
      `<circle cx="${dotStartX + 20}" cy="${coord(dotY)}" r="${dotRadius}" fill="#febc2e"/>`,
    )
    parts.push(
      `<circle cx="${dotStartX + 40}" cy="${coord(dotY)}" r="${dotRadius}" fill="#28c840"/>`,
    )
  }

  if (title) {
    const titleStartX = dotStartX + 40 + dotRadius + 14
    parts.push(
      `<text x="${titleStartX}" y="${coord(dotY)}" font-size="${titleFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="bold" fill="${titleColor}" dominant-baseline="central">${escapeXml(title)}</text>`,
    )
  }

  return parts
}
