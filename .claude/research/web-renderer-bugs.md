# Web Renderer Bug Research: DOM and Canvas2D Garbled Output

**Status**: Analysis complete. Root causes identified.

## The Bug

Both the DOM and Canvas2D browser renderers produce garbled output:

- **Visible symptom**: All content compressed into a single horizontal line with overlapping text
- **xterm renderer**: Works correctly

## Architecture Overview

The renderer pipeline is identical for all three (DOM, Canvas, xterm):

```
React → Reconciler → [5-Phase Pipeline] → RenderAdapter → Output
                     measure
                     layout
                     scroll
                     screenRect
                     content         ← outputs to RenderBuffer
                     output          ← converts buffer to adapter-specific format
```

### Three Rendering Targets

| Renderer   | Output Format    | File                  | Status     |
| ---------- | ---------------- | --------------------- | ---------- |
| **DOM**    | `<div>` elements | `src/dom/index.ts`    | **BROKEN** |
| **Canvas** | Canvas 2D pixels | `src/canvas/index.ts` | **BROKEN** |
| **xterm**  | ANSI sequences   | `src/xterm/index.ts`  | ✓ Working  |

## Root Causes Identified

### 1. **Coordinate System Mismatch (DOM and Canvas)**

Both adapters treat input coordinates as **pixels**, but the content-phase pipeline outputs **character-based coordinates**.

#### DOM Adapter (`src/adapters/dom-adapter.ts`)

The `render()` method positions text using **pixel coordinates**:

```typescript
lineDiv.style.cssText = `
  position: absolute;
  left: 0;
  top: ${y}px;           // ← PIXEL coordinate
  height: ${lineHeight}px;
`

span.style.cssText = styles.join("; ")
// Line 322: styles.push(`position: absolute`, `left: ${run.x}px`)
```

**Problem**: The layout phase computes layout rectangles in **character cells** (rows/cols), not pixels. When the content phase renders text at position `(x, y)`, it's expecting `x` and `y` to be character cell indices. The DOM adapter interprets these as pixels, causing massive compression.

**Example**: If layout places text at cell (5, 2), the pipeline calls:

```typescript
drawText(5, 2, "Hello", style) // (5, 2) = char position at col 5, row 2
```

DOM adapter renders this as:

```typescript
left: 5px;  // 5 pixels, not 5 character widths
top: 2px;   // 2 pixels, not 2 character heights
```

Result: All text stacks at top-left, massively overlapped.

#### Canvas Adapter (`src/adapters/canvas-adapter.ts`)

Same issue — the `drawText()` method treats coordinates as pixels:

```typescript
drawText(x: number, y: number, text: string, style: RenderStyle): void {
  this.ctx.fillText(text, x, y)  // x, y are interpreted as pixels
}
```

The canvas context's default transform is identity, so `ctx.fillText(5, 2)` renders at pixel position (5, 2), not character position (5, 2).

### 2. **Missing Character Width Scaling**

Neither adapter converts character positions to pixel positions based on **font metrics**.

For correct rendering, the adapters need:

```
pixel_x = char_x * char_width_px
pixel_y = char_y * char_height_px
```

Where:

- `char_width_px` ≈ `fontSize × 0.6` (monospace fonts are roughly 60% as wide as tall)
- `char_height_px` = `fontSize * lineHeight`

### 3. **Why xterm Works Correctly**

The xterm adapter (`src/xterm/index.ts`) doesn't render pixels at all — it works with **ANSI escape sequences and characters**.

The terminal adapter (`src/adapters/terminal-adapter.ts`) outputs a `TerminalBuffer`:

- Stores cells as character grid (rows/cols)
- Tracks foreground, background, and attributes per cell
- The output phase (`src/pipeline/output-phase.ts`) converts this grid to ANSI

xterm.js receives the ANSI string and renders it character-by-character at correct positions. **No coordinate conversion needed** — the grid is already in the right format.

## How Coordinate Conversion Should Work

### For DOM Adapter

Instead of:

```typescript
lineDiv.style.top = `${y}px`
span.style.left = `${run.x}px`
```

Should be:

```typescript
const charWidth = config.fontSize * 0.6 // or measure it
const charHeight = config.fontSize * config.lineHeight

lineDiv.style.top = `${y * charHeight}px`
span.style.left = `${run.x * charWidth}px`
```

### For Canvas Adapter

Instead of:

```typescript
this.ctx.fillText(text, x, y)
```

Should be:

```typescript
const charWidth = config.fontSize * 0.6
const charHeight = config.fontSize * config.lineHeight

this.ctx.fillText(text, x * charWidth, y * charHeight)
```

## Architecture Evidence

### 1. Content Phase Outputs Character Grid

From `src/pipeline/content-phase.ts`, the content phase renders to a **TerminalBuffer** which is inherently character-based:

```typescript
type TerminalBuffer = {
  readonly width: number // in characters
  readonly height: number // in characters
  drawText(x: number, y: number, text: string, style: RenderStyle): void
  drawChar(x: number, y: number, char: string, style: RenderStyle): void
  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void
}
```

All methods use character coordinates.

### 2. Layout Phase Produces Character Dimensions

The layout engine (Flexx) computes layout in **character cells**. From `examples/web/xterm-app.tsx`:

```typescript
function SizeDisplay() {
  const { width, height } = useContentRect()
  return (
    <Text color="green">
      Size: {width} cols x {height} rows  // ← reported in cols/rows, not pixels
    </Text>
  )
}
```

The xterm adapter correctly interprets this: `useContentRect()` returns character dimensions.

### 3. Browser Adapters Misinterpret the Semantics

Both DOM and Canvas adapters create `RenderBuffer` implementations with method signatures identical to `TerminalBuffer`:

```typescript
export class DOMRenderBuffer implements RenderBuffer {
  drawText(x: number, y: number, text: string, style: RenderStyle): void {
    // Treats x, y as pixels instead of character positions
  }
}
```

The fix requires treating `x` and `y` as **character indices**, not pixel coordinates.

## Recent Git History

The adapters were added or significantly modified in:

1. `c3489bd` (2024-10-XX) - "feat(inkx): add RenderAdapter abstraction for multi-target rendering"
2. `2d7acea` (2024-11-XX) - "feat(web): add DOM adapter for accessible web rendering"
3. `40d6454` (2024-11-XX) - "feat(web): add real inkx demos for Canvas and DOM adapters"

At the time of these commits, the coordinate system semantic **was not clarified in code**. The interface `RenderAdapter` uses `(x: number, y: number)` without specifying whether these are characters or pixels. This led both implementations to assume pixels.

## Test Evidence

From `tests/dom-adapter.test.ts` and `tests/canvas-adapter.test.ts`, the tests are **unit tests** that verify the adapters accept method calls, but **do not verify correct pixel output**. They test:

```typescript
test("drawText does not throw", () => {
  buffer.drawText(10, 10, "Hello World", { fg: "#ffffff" })
  // ONLY checks that the call succeeds, not that layout is correct
})
```

There are E2E tests (`tests/dom-e2e.test.tsx`, `tests/canvas-e2e.test.tsx`), but these are likely screenshot-based and may not run in CI (they use TTY/GUI tools).

## Fix Strategy

Both adapters need a **character-to-pixel coordinate conversion** in their rendering methods:

### DOM Adapter

In `src/adapters/dom-adapter.ts`, modify the `render()` method:

```typescript
render(): void {
  const charWidth = this.measureCharacterWidth()
  const charHeight = this.config.fontSize * this.config.lineHeight

  // For each line div
  for (const [y, runs] of sortedLines) {
    const lineDiv = document.createElement("div")
    lineDiv.style.top = `${y * charHeight}px`  // Convert from char row to pixel

    // For each text run
    for (const run of sortedRuns) {
      const span = document.createElement("span")
      span.style.left = `${run.x * charWidth}px`  // Convert from char col to pixel
    }
  }
}

private measureCharacterWidth(): number {
  // Measure a single character in the target font
  const el = document.createElement("span")
  el.style.fontFamily = this.config.fontFamily
  el.style.fontSize = `${this.config.fontSize}px`
  el.textContent = "X"
  document.body.appendChild(el)
  const width = el.offsetWidth
  document.body.removeChild(el)
  return width
}
```

### Canvas Adapter

In `src/adapters/canvas-adapter.ts`, modify the `drawText()` and `fillRect()` methods:

```typescript
private getCharacterWidth(): number {
  // Cache after first measurement
  if (this.charWidth === undefined) {
    const ctx = this.ctx
    ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`
    this.charWidth = ctx.measureText("X").width
  }
  return this.charWidth
}

drawText(x: number, y: number, text: string, style: RenderStyle): void {
  const charWidth = this.getCharacterWidth()
  const charHeight = this.config.fontSize * this.config.lineHeight

  // Convert from character coordinates to pixels
  const pixelX = x * charWidth
  const pixelY = y * charHeight

  this.ctx.fillText(text, pixelX, pixelY)
  // ... rest of styling
}

fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void {
  const charWidth = this.getCharacterWidth()
  const charHeight = this.config.fontSize * this.config.lineHeight

  this.ctx.fillStyle = resolveColor(style.bg, this.config.backgroundColor)
  this.ctx.fillRect(
    x * charWidth,
    y * charHeight,
    width * charWidth,
    height * charHeight
  )
}
```

## Verification Strategy

1. **Unit tests**: Update `dom-adapter.test.ts` and `canvas-adapter.test.ts` to verify coordinate conversion
2. **Visual test**: Open `examples/web/dom.html` and `examples/web/canvas.html`, verify layout is correct (no compression)
3. **Regression**: Run full test suite with `bun run test:all` to ensure no breakage

## Related Code Sections

- **Layout phase**: `src/pipeline/layout-phase.ts` (computes character cell positions)
- **Content phase**: `src/pipeline/content-phase.ts` (renders to character grid)
- **Browser renderer**: `src/browser-renderer.ts` (shared lifecycle for DOM/Canvas)
- **Terminal adapter**: `src/adapters/terminal-adapter.ts` (working reference implementation)

---

## Summary

| Issue                     | Root Cause                                          | Fix                                                                                   |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| DOM compressed to line    | DOM adapter treats character positions as pixels    | Convert char positions to pixel positions using `charWidth × col`, `charHeight × row` |
| Canvas compressed to line | Canvas adapter treats character positions as pixels | Convert char positions to pixel positions using `charWidth × col`, `charHeight × row` |
| xterm works               | Uses ANSI/character grid natively                   | No conversion needed                                                                  |
