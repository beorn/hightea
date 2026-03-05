# Terminal Technology Reference

## Overview of ANSI/VT Standards

The ANSI escape code ecosystem is a layered set of standards that evolved over decades:

| Standard                 | Year    | Description                                              |
| ------------------------ | ------- | -------------------------------------------------------- |
| **ECMA-48 / ANSI X3.64** | 1976    | Core escape sequences, CSI (Control Sequence Introducer) |
| **VT100**                | 1978    | DEC's implementation, became de facto standard           |
| **VT220/VT320**          | 1983-87 | 8-bit characters, more CSI sequences                     |
| **xterm**                | 1984+   | Extended sequences, 256 colors, true color               |
| **ISO 8613-6**           | 1994    | ITU T.416 - defines SGR 58/59 for underline color        |
| **Kitty**                | 2017+   | Extended keyboard protocol, underline styles             |
| **OSC 8**                | 2017+   | Hyperlinks (egmontkob proposal)                          |

## SGR (Select Graphic Rendition) Codes

SGR codes control text styling via `\x1b[<params>m`:

### Basic Attributes (ECMA-48)

| Code | Effect           | Code | Reset            |
| ---- | ---------------- | ---- | ---------------- |
| 1    | Bold             | 22   | Normal intensity |
| 2    | Dim/faint        | 22   | Normal intensity |
| 3    | Italic           | 23   | Not italic       |
| 4    | Underline        | 24   | Not underlined   |
| 5    | Slow blink       | 25   | Not blinking     |
| 7    | Reverse/inverse  | 27   | Not reversed     |
| 8    | Hidden/invisible | 28   | Visible          |
| 9    | Strikethrough    | 29   | Not struck       |

### Standard Colors (8 colors + bright variants)

| Foreground | Background | Color           |
| ---------- | ---------- | --------------- |
| 30         | 40         | Black           |
| 31         | 41         | Red             |
| 32         | 42         | Green           |
| 33         | 43         | Yellow          |
| 34         | 44         | Blue            |
| 35         | 45         | Magenta         |
| 36         | 46         | Cyan            |
| 37         | 47         | White           |
| 90-97      | 100-107    | Bright variants |

### Extended Colors (256-color and True Color)

```
\x1b[38;5;<n>m       # Foreground (256-color palette)
\x1b[48;5;<n>m       # Background (256-color palette)
\x1b[38;2;<r>;<g>;<b>m  # Foreground (24-bit RGB)
\x1b[48;2;<r>;<g>;<b>m  # Background (24-bit RGB)
```

### Extended Underline Styles (Kitty extension)

Uses colon-separated parameters per ISO 8613-6:

```
\x1b[4:0m   # No underline
\x1b[4:1m   # Single underline (standard)
\x1b[4:2m   # Double underline
\x1b[4:3m   # Curly/wavy underline
\x1b[4:4m   # Dotted underline
\x1b[4:5m   # Dashed underline
```

### Underline Color (ISO 8613-6 / ITU T.416)

```
\x1b[58:2::<r>:<g>:<b>m   # Set underline color (RGB)
\x1b[58:5:<n>m            # Set underline color (256-color)
\x1b[59m                  # Reset underline color
```

Note: The double colon `::` skips the color space ID (always assumed to be 2 for RGB).

## OSC (Operating System Command) Sequences

OSC sequences control terminal features beyond text styling:

| OSC Code | Purpose                                       |
| -------- | --------------------------------------------- |
| 0        | Set window title and icon name                |
| 1        | Set icon name                                 |
| 2        | Set window title                              |
| 4        | Define color palette entry                    |
| 7        | Set working directory (for shell integration) |
| **8**    | **Hyperlinks** (our focus)                    |
| 9        | Desktop notifications (iTerm2)                |
| 10-19    | Query/set default colors                      |
| 52       | Clipboard access                              |
| 133      | Shell integration (prompt marking)            |
| 1337     | iTerm2 proprietary (images, etc.)             |

### OSC 8 Hyperlinks

```
\x1b]8;;<url>\x1b\\<text>\x1b]8;;\x1b\\
```

- `\x1b]8;;` - Start hyperlink, followed by URL
- `\x1b\\` - String terminator (ST)
- Text displayed to user (clickable)
- `\x1b]8;;\x1b\\` - End hyperlink (empty URL)

Optional parameters between the semicolons:

```
\x1b]8;id=myid;<url>\x1b\\<text>\x1b]8;;\x1b\\
```

The `id=` parameter groups multiple hyperlink segments as one logical link.

## References

- [ECMA-48 Standard](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/) - Control Functions for Coded Character Sets
- [Kitty Underlines Documentation](https://sw.kovidgoyal.net/kitty/underlines/) - Extended underline styles
- [OSC 8 Hyperlinks Proposal](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) - Terminal hyperlinks spec
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) - Comprehensive reference
- [ITU T.416](https://www.itu.int/rec/T-REC-T.416/en) - ISO 8613-6, defines underline color
- [Terminal Feature Detection](https://github.com/termstandard/colors) - Color/feature detection methods
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) - Inline images
