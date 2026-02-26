# inkx Examples & Showcases

## Directory Structure

| Directory      | What                                                       |
| -------------- | ---------------------------------------------------------- |
| `interactive/` | Full apps — run with `bun examples/interactive/<name>.tsx` |
| `inline/`      | Inline mode examples (no alt screen)                       |
| `kitty/`       | Kitty protocol demos                                       |
| `layout/`      | Layout engine examples                                     |
| `runtime/`     | Runtime layer demos (run, createApp, createStore)          |
| `playground/`  | Quick prototyping                                          |
| `web/`         | Browser renderers (DOM, Canvas2D)                          |
| `screenshots/` | Reference screenshots for visual regression                |

## Making a Great Showcase

### Design Principles

1. **Show, don't tell.** A showcase should demonstrate inkx features through working UI, not walls of text. Intro text is fine — but collapse it once the demo starts.

2. **Fill the terminal.** For apps using `useScrollback`, set `height={termRows}` on the root Box with `flexGrow={1}` on the content area. This pins the status bar to the bottom and ensures scrollback writes cause real terminal scrolling (see [Scrollback Pattern](#scrollback-pattern) below).

3. **Single status bar.** Keep the status bar to one line. Include: context bar, elapsed time, cost, and key hints. Remove anything that doesn't help the user interact.

4. **Conditional headers.** Show feature bullets before the demo starts (when there's space). Collapse to a one-liner once content fills the screen.

5. **Respect terminal width.** Boxes with borders at 120 cols should leave room for the border characters. Test at 80 and 120 cols.

6. **Streaming feels real.** For coding agent demos: thinking spinner (1-2s) → word-by-word text reveal → tool call spinner → output. Use `setInterval` at 50ms with 8-12% fraction increments.

7. **Clean exit.** Call `process.exit(0)` after `waitUntilExit()` until the event loop hang is fixed (see `km-inkx.event-loop-hang`).

### Scrollback Pattern

The recommended pattern for apps that freeze items to terminal scrollback:

```tsx
function App() {
  // Track terminal height (updates on resize)
  const [termRows, setTermRows] = useState(process.stdout.rows ?? 40)
  useEffect(() => {
    const onResize = () => setTermRows(process.stdout.rows ?? 40)
    process.stdout.on("resize", onResize)
    return () => {
      process.stdout.off("resize", onResize)
    }
  }, [])

  const frozenCount = useScrollback(items, {
    frozen: (item) => item.frozen,
    render: (item) => renderStringSync(<ItemView item={item} />, { width: cols }),
    markers: true, // OSC 133 for Cmd+Up/Down navigation
  })

  return (
    <Box flexDirection="column" height={termRows}>
      {/* Header — fixed height */}
      <Header frozenCount={frozenCount} />

      {/* Content — fills available space */}
      <Box flexDirection="column" flexGrow={1} gap={1} overflow="hidden">
        {activeItems.map((item) => (
          <ItemView key={item.id} item={item} />
        ))}
      </Box>

      {/* Status bar — pinned to bottom */}
      <StatusBar />
    </Box>
  )
}

await render(<App />, term, { mode: "inline" })
```

**Why `height={termRows}`?** In inline mode, inkx auto-sizes to content. Without a fixed height, the dynamic area may not fill the terminal. When `useScrollback` writes frozen content to stdout, the terminal only scrolls if the cursor is at the bottom row. If the dynamic area is shorter than the terminal, scrollback text stays visible on screen and gets erased on the next render — losing the scrollback content.

Setting `height={termRows}` ensures:

- The cursor is always at the terminal bottom after each render
- Scrollback writes cause real terminal scrolling
- Frozen content persists in the terminal's scrollback buffer
- The status bar is pinned to the bottom

**Why `overflow="hidden"` on the content area?** Prevents content from overflowing past the status bar when exchanges are tall. Combined with `flexGrow={1}`, the content area fills all available space between the header and status bar.

### Theme Tokens

Use semantic `$token` colors instead of hardcoded values:

| Token      | Use for                               |
| ---------- | ------------------------------------- |
| `$primary` | Active elements, progress bars, links |
| `$success` | Completed items, checkmarks           |
| `$warning` | Caution, compaction                   |
| `$error`   | Failures, diff removals               |
| `$muted`   | Secondary info, timestamps            |
| `$border`  | Default border color                  |

### Testing Showcases

1. **Visual check**: Run in TTY and step through all states
2. **Resize**: Verify layout adapts to terminal resize
3. **Scrollback**: After frozen items, scroll up — verify colors/borders preserved
4. **Width**: Test at 80 and 120 columns
5. **Fast mode**: `--fast` flag should skip all animation for quick validation

## Known Issues

- **Event loop hang**: `render()` unmount doesn't fully release all event loop references. Use `process.exit(0)` after `waitUntilExit()` as a workaround. Tracked in `km-inkx.event-loop-hang`.
