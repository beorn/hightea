# Semantic Color Tokens

_How to color the shiniest Silvery apps_

Colors tarnish fast. A hardcoded `"red"` here, a `"$success"` where you meant "brand emphasis" there — suddenly your UI is a patchwork of misused tokens that breaks on every theme. These guidelines keep your colors **shiny**.

## The #1 Rule: Don't Specify Colors

Most Silvery components already use the correct semantic colors by default. **The best color code is no color code.**

| Component | What's automatic | You just set |
| --- | --- | --- |
| `<Text>` | `$fg` text color | Nothing — it's the default |
| `<TextInput>` | `$inputborder` → `$focusborder` on focus, `$control` prompt, cursor | `borderStyle` to opt into borders |
| `<TextArea>` | `$inputborder` → `$focusborder` on focus | `borderStyle` to opt into borders |
| `<ModalDialog>` | `$surfacebg` bg, `$border` border, `$primary` title | Nothing — all automatic |
| `<CommandPalette>` | `$surfacebg` bg, `$border` border | Nothing |
| `<Toast>` | `$surfacebg` bg, `$border` border | Nothing |
| `<SelectList>` | `inverse` for selection, `dimColor` for disabled | Nothing |
| `<Badge>` | Variant colors: `$success`, `$error`, `$warning`, `$primary` | `variant` name |
| `<ErrorBoundary>` | `$error` border | Nothing |
| `<Divider>` | `dimColor` for line character | Nothing |
| `<ProgressBar>` | `dimColor` for empty portion | `color` for filled portion |
| `<Spinner>` | `$fg` | Nothing |
| `<Button>` | `inverse` when focused/active | Nothing |

::: tip Shiny
```tsx
<ModalDialog title="Confirm">         // auto: $surfacebg, $border, $primary title
  <Text>Are you sure?</Text>          // auto: $fg
</ModalDialog>

<TextInput borderStyle="round" />     // auto: $inputborder → $focusborder on focus
```
:::

::: danger Tarnished
```tsx
// Rebuilding what the component already does
<Box backgroundColor="$surfacebg" borderColor="$border" borderStyle="round">
  <Text color="$primary" bold>Confirm</Text>
  <Text color="$fg">Are you sure?</Text>
  <TextInput borderColor={focused ? "$focusborder" : "$inputborder"} />
</Box>
```
:::

::: warning Smell: `color="$fg"` or `borderColor="$border"`
If you're explicitly writing the default value, you're adding noise. Remove it — the default is correct.
:::

::: warning Smell: `borderColor={focused ? ... : ...}`
If you're implementing focus color switching manually, the component should handle it. Use `borderStyle` on the component and let it manage focus states.
:::

## When You Do Need Colors

Only specify colors when building custom UI that doesn't map to a standard component, or when adding status/accent emphasis to text. The rest of this guide covers those cases.

## Text Hierarchy

Four levels, used in order of prominence:

| Token         | Use for                                     |
| ------------- | ------------------------------------------- |
| `$primary`    | Headings, active indicators, brand emphasis |
| `$fg`         | Primary content — body text, labels, values |
| `$muted`      | Secondary — descriptions, metadata, hints   |
| `$disabledfg` | Disabled text, placeholders                 |

Plus two special-purpose text tokens:

| Token      | Use for                                  |
| ---------- | ---------------------------------------- |
| `$link`    | Hyperlinks, references                   |
| `$control` | Interactive chrome — prompts, shortcuts  |

::: tip Shiny
```tsx
<Text bold color="$primary">Project Name</Text>        // heading — draws the eye
<Text>Build succeeded in 2.3s</Text>                    // body — $fg is the default
<Text color="$muted">src/index.ts • 142 lines</Text>   // metadata — de-emphasized
<Text color="$disabledfg">No changes</Text>             // inactive — clearly disabled
```
A clear visual hierarchy: the heading pops, the body is readable, the metadata recedes, the disabled text fades.
:::

::: danger Tarnished
```tsx
<Text color="$primary">src/index.ts • 142 lines</Text> // metadata isn't primary
<Text color="$muted">Build failed!</Text>               // important info shouldn't be muted
<Text color="$success">Project Name</Text>              // success ≠ branding
<Text color="red">Error message</Text>                  // hardcoded color
```
:::

::: warning Smell: Everything is `$primary`
If three or more sibling elements all use `$primary`, nothing stands out. Only headings and key indicators get `$primary` — everything else should be `$fg` or `$muted`.
:::

::: warning Smell: `color="red"` or `color="#A3BE8C"`
Hardcoded colors break on theme changes and can't adapt to terminal capabilities. Always use a `$token`.
:::

## Borders

Three tiers, from structural to interactive:

| Token          | Use for                                    | Applied by |
| -------------- | ------------------------------------------ | --- |
| `$border`      | Structural dividers, panel outlines, rules | Box (automatic default) |
| `$inputborder` | Input/button borders (unfocused)           | TextInput/TextArea (automatic) |
| `$focusborder` | Focus rings on active inputs               | TextInput/TextArea (automatic) |

Plus the outline token:

| Token        | Use for                              |
| ------------ | ------------------------------------ |
| `$focusring` | Keyboard focus outline on any element |

::: tip Shiny
```tsx
<TextInput borderStyle="round" />       // auto: $inputborder → $focusborder on focus

<Box borderStyle="single">              // structural — auto $border
  <Text>Panel content</Text>
</Box>
```
Set `borderStyle`, get correct colors for free.
:::

::: danger Tarnished
```tsx
<Box borderColor={focused ? "blue" : "gray"} borderStyle="round">
  <TextInput />
</Box>
```
Manual focus handling with hardcoded colors — breaks on every theme.
:::

## Surfaces & Backgrounds

Each surface has a paired text token. **Always use the pair together.**

| Background   | Text token   | Use for                               |
| ------------ | ------------ | ------------------------------------- |
| `$bg`        | `$fg`        | Default app background                |
| `$surfacebg` | `$surface`   | Elevated panels, dialogs, cards       |
| `$popoverbg` | `$popover`   | Floating content — tooltips, dropdowns |
| `$inversebg` | `$inverse`   | Chrome areas — status bars, title bars |
| `$mutedbg`   | `$fg`        | Hover highlights, subtle emphasis     |

::: tip Shiny
```tsx
// Elevated panel — correct pair
<Box backgroundColor="$surfacebg">
  <Text color="$surface">Dialog content</Text>
</Box>

// Status bar — inverted pair
<Box backgroundColor="$inversebg">
  <Text color="$inverse">main • 3 files changed</Text>
</Box>
```
:::

::: danger Tarnished
```tsx
// Mismatched — $fg may not contrast on $surfacebg
<Box backgroundColor="$surfacebg">
  <Text>Content</Text>
</Box>
```
:::

::: warning Smell: `backgroundColor` without a matching text color
Every `$*bg` token has a corresponding text token. If you set a background but don't set the text color, you're gambling on contrast.
:::

## Status Colors

| Token      | Meaning                       | Icon convention |
| ---------- | ----------------------------- | --------------- |
| `$success` | Completion, positive outcomes | ✓ ✔ ◆          |
| `$warning` | Caution, pending, unsaved     | ⚠ △             |
| `$error`   | Errors, destructive, failures | ✗ ✘ ●          |
| `$info`    | Neutral notices, tips         | ℹ ○             |

**As text on default background**: use the base token directly — they're designed to be visible on `$bg`.

**As filled backgrounds**: use the base token for bg, `*fg` for text on it.

::: tip Shiny
```tsx
// Status text — clear meaning with icon + color
<Text color="$success">✓ Tests passed</Text>
<Text color="$error">✗ Build failed</Text>
<Text color="$warning">⚠ Unsaved changes</Text>

// Filled badge
<Box backgroundColor="$error">
  <Text color="$errorfg">ERROR</Text>
</Box>
```
Every status color is paired with a label or icon — works even in monochrome.
:::

::: danger Tarnished
```tsx
<Text color="$success">Agent</Text>        // agent name ≠ success
<Box outlineColor="$success">              // decorative border ≠ success
<Box borderColor="$error">                 // structural border ≠ error state
```
Using status colors for decoration strips them of meaning. When everything is green, actual success signals disappear.
:::

::: warning Smell: Status color without a label or icon
In 16-color mode, `$warning` and `$primary` may be the same yellow. Color-blind users can't distinguish red from green. Always pair status colors with text labels (✓, ✗, ⚠) or words ("Error:", "Done").
:::

::: warning Smell: `$success` or `$error` on a border
Status tokens are for content that communicates status. Structural borders use `$border`. The only exception: `<ErrorBoundary>` uses `$error` for its border because the entire component represents an error state.
:::

## Accent Pairs

| Token        | Use for                                 |
| ------------ | --------------------------------------- |
| `$primary`   | Brand accent, primary actions, headings |
| `$secondary` | Alternate accent, secondary actions     |
| `$accent`    | Extra emphasis (not status, not brand)  |

Each has a `*fg` pair for text on that background.

::: tip Shiny
```tsx
<Box backgroundColor="$primary">
  <Text color="$primaryfg">Submit</Text>
</Box>
```
:::

::: warning Smell: More than 2-3 accent colors on screen
If everything is colorful, nothing stands out. Use spacing, typography (bold, dim), and layout for hierarchy — not more colors.
:::

## Selection & Cursor

| Token          | Use for                       |
| -------------- | ----------------------------- |
| `$selectionbg` | Selected item/text background |
| `$selection`   | Text on selected background   |
| `$cursorbg`    | Cursor block color            |
| `$cursor`      | Text under cursor             |

These are handled by the framework automatically. You almost never set them manually.

## Indexed Palette (`$color0`–`$color15`)

For **categorization** — tags, calendar colors, chart series, syntax highlighting:

```tsx
<Text color="$color1">bug</Text>      // red tag
<Text color="$color4">feature</Text>  // blue tag
<Text color="$color5">docs</Text>     // purple tag
```

::: warning Smell: Palette colors for UI chrome
`$color0`–`$color15` are for data categorization only. UI borders, backgrounds, and status indicators use semantic tokens, not palette indices.
:::

## Terminal-Specific Notes

- **No transparency**: Every color is solid. Use `$mutedbg` for hover states instead of opacity overlays.
- **dim attribute**: `$muted` may use ANSI dim in 16-color mode. Don't rely on muted text for critical information.
- **16-color fallback**: Status colors may map to the same ANSI color (yellow for both `$primary` and `$warning`). Always pair with text labels or icons.
- **Progressive enhancement**: Same token vocabulary works across ANSI 16 → 256 → truecolor. The framework handles mapping.

## Decision Flowchart

**"What color should this element use?"**

1. **Is there a standard component for this?** → Use it. Don't specify colors.
2. **Is it body text?** → `$fg` (default — don't specify)
3. **Is it secondary/supporting?** → `$muted`
4. **Is it disabled or placeholder?** → `$disabledfg`
5. **Is it a heading or brand element?** → `$primary`
6. **Is it a hyperlink?** → `$link`
7. **Is it interactive chrome (prompt, shortcut)?** → `$control`
8. **Does it indicate success/error/warning?** → `$success` / `$error` / `$warning` + icon
9. **Is it a structural border?** → don't specify (`$border` is automatic)
10. **Is it an input border?** → set `borderStyle` (auto `$inputborder` / `$focusborder`)
11. **Is it an elevated surface?** → `$surfacebg` + `$surface` text
12. **Is it a status/chrome bar?** → `$inversebg` + `$inverse`
13. **Is it a data category (tag, label)?** → `$color0`–`$color15`
14. **None of the above?** → You probably need `$fg` or `$muted`. If neither fits, your design may need a new token — add it to the theme, don't hardcode a color.

## Smell Summary

| Smell | What it means |
| --- | --- |
| `color="$fg"` | Writing the default — remove it |
| `color="red"` or `"#hex"` | Hardcoded — use a `$token` |
| `borderColor={focused ? ... : ...}` | Manual focus switching — let the component handle it |
| `backgroundColor="$surfacebg"` without `color="$surface"` | Unpaired surface — add the matching text token |
| Three siblings all `$primary` | Flat hierarchy — only headings get `$primary` |
| `$success` or `$error` without icon/label | Color-only status — add redundant text signal |
| `$success` on a border or background for decoration | Misused status — use `$border` or `$primary` |
| `$color0`–`$color15` for UI chrome | Palette colors are for data, not chrome |
| Manually specifying colors a component sets automatically | Fighting the framework — remove and trust defaults |
