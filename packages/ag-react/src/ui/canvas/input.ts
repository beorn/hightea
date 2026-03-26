/**
 * Canvas Input Handler
 *
 * Converts DOM keyboard/mouse/wheel events to terminal escape sequences.
 * Uses a hidden <textarea> for keyboard capture (standard web terminal technique).
 */

/** Convert a DOM KeyboardEvent to a terminal escape sequence string.
 * Returns null for keys that shouldn't produce output (Shift alone, Meta alone, etc). */
export function keyboardEventToSequence(e: KeyboardEvent): string | null {
  // Modifier-only keys produce no output
  if (
    e.key === "Shift" ||
    e.key === "Control" ||
    e.key === "Alt" ||
    e.key === "Meta" ||
    e.key === "CapsLock" ||
    e.key === "NumLock"
  )
    return null

  // Ctrl+key combinations (Ctrl+A=0x01 ... Ctrl+Z=0x1A)
  if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    const code = e.key.toLowerCase().charCodeAt(0)
    if (code >= 97 && code <= 122) return String.fromCharCode(code - 96)
    // Ctrl+[ = Escape, Ctrl+] = 0x1D, Ctrl+\ = 0x1C
    if (e.key === "[") return "\x1b"
    if (e.key === "]") return "\x1d"
    if (e.key === "\\") return "\x1c"
  }

  // Alt/Option key -> ESC prefix + character
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
    return "\x1b" + e.key
  }

  // Function keys
  switch (e.key) {
    case "ArrowUp":
      return "\x1b[A"
    case "ArrowDown":
      return "\x1b[B"
    case "ArrowRight":
      return "\x1b[C"
    case "ArrowLeft":
      return "\x1b[D"
    case "Enter":
      return "\r"
    case "Escape":
      return "\x1b"
    case "Tab":
      return e.shiftKey ? "\x1b[Z" : "\t"
    case "Backspace":
      return "\x7f"
    case "Delete":
      return "\x1b[3~"
    case "Home":
      return "\x1b[H"
    case "End":
      return "\x1b[F"
    case "PageUp":
      return "\x1b[5~"
    case "PageDown":
      return "\x1b[6~"
    case "Insert":
      return "\x1b[2~"
    case "F1":
      return "\x1bOP"
    case "F2":
      return "\x1bOQ"
    case "F3":
      return "\x1bOR"
    case "F4":
      return "\x1bOS"
    case "F5":
      return "\x1b[15~"
    case "F6":
      return "\x1b[17~"
    case "F7":
      return "\x1b[18~"
    case "F8":
      return "\x1b[19~"
    case "F9":
      return "\x1b[20~"
    case "F10":
      return "\x1b[21~"
    case "F11":
      return "\x1b[23~"
    case "F12":
      return "\x1b[24~"
    // Space key
    case " ":
      return " "
  }

  // Regular printable character (single char, no Ctrl, no Meta)
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) return e.key

  return null
}

export interface CanvasInputConfig {
  /** Container element to attach the hidden textarea to and listen for events on */
  container: HTMLElement
  /** Called with terminal escape sequence data (keyboard input) */
  onData: (data: string) => void
  /** Called when focus changes */
  onFocusChange?: (focused: boolean) => void
}

export interface CanvasInputInstance {
  /** Focus the hidden input element */
  focus(): void
  /** Blur the hidden input element */
  blur(): void
  /** Whether the input is currently focused */
  readonly focused: boolean
  /** Update dimensions (for mouse coordinate conversion) */
  updateDimensions(charWidth: number, lineHeight: number): void
  /** Clean up DOM listeners and elements */
  dispose(): void
}

/**
 * Create a canvas input handler.
 *
 * Appends a hidden <textarea> to the container for keyboard capture.
 * Listens for keyboard events and converts them to terminal escape sequences.
 */
export function createCanvasInput(config: CanvasInputConfig): CanvasInputInstance {
  const { container, onData, onFocusChange } = config
  let disposed = false
  let isFocused = false

  // Create hidden textarea for keyboard capture
  // This is the standard technique -- xterm.js, VS Code terminal, etc. all do this.
  const textarea = document.createElement("textarea")
  textarea.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    resize: none;
    pointer-events: none;
    z-index: -1;
  `
  textarea.setAttribute("autocomplete", "off")
  textarea.setAttribute("autocorrect", "off")
  textarea.setAttribute("autocapitalize", "off")
  textarea.setAttribute("spellcheck", "false")
  textarea.tabIndex = -1
  container.style.position = container.style.position || "relative"
  container.appendChild(textarea)

  // Keyboard handler
  function onKeyDown(e: KeyboardEvent): void {
    if (disposed) return

    // Let browser handle Cmd+C, Cmd+V, etc (standard copy/paste)
    if (e.metaKey) return

    const seq = keyboardEventToSequence(e)
    if (seq !== null) {
      e.preventDefault()
      e.stopPropagation()
      onData(seq)
    }
  }

  // Paste handler
  function onPaste(e: ClipboardEvent): void {
    if (disposed) return
    const text = e.clipboardData?.getData("text")
    if (text) {
      e.preventDefault()
      // Send as bracketed paste: ESC[200~ ... ESC[201~
      onData("\x1b[200~" + text + "\x1b[201~")
    }
  }

  // Focus handlers
  function onFocus(): void {
    isFocused = true
    onFocusChange?.(true)
  }

  function onBlur(): void {
    isFocused = false
    onFocusChange?.(false)
  }

  // Click on container -> focus the hidden textarea
  function onContainerClick(): void {
    if (!disposed) textarea.focus()
  }

  // Wire up events
  textarea.addEventListener("keydown", onKeyDown)
  textarea.addEventListener("paste", onPaste)
  textarea.addEventListener("focus", onFocus)
  textarea.addEventListener("blur", onBlur)
  container.addEventListener("click", onContainerClick)

  return {
    focus(): void {
      if (!disposed) textarea.focus()
    },

    blur(): void {
      if (!disposed) textarea.blur()
    },

    get focused(): boolean {
      return isFocused
    },

    updateDimensions(_charWidth: number, _lineHeight: number): void {
      // Reserved for future mouse coordinate conversion
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      textarea.removeEventListener("keydown", onKeyDown)
      textarea.removeEventListener("paste", onPaste)
      textarea.removeEventListener("focus", onFocus)
      textarea.removeEventListener("blur", onBlur)
      container.removeEventListener("click", onContainerClick)
      container.removeChild(textarea)
    },
  }
}
