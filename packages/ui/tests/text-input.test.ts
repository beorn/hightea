/**
 * Tests for TextInput React component and CLI wrapper
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import React, { createElement } from "react"
import { TextInput, useTextInput } from "../src/input/TextInput.js"
import { createTextInput } from "../src/wrappers/with-text-input.js"

// Capture stdout to silence text input render output
let originalWrite: typeof process.stdout.write

beforeEach(() => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

describe("TextInput React Component", () => {
  describe("TextInput", () => {
    it("renders with required props", () => {
      const element = createElement(TextInput, {
        value: "hello",
        onChange: () => {},
      })

      expect(element.type).toBe(TextInput)
      expect(element.props.value).toBe("hello")
    })

    it("accepts placeholder prop", () => {
      const element = createElement(TextInput, {
        value: "",
        onChange: () => {},
        placeholder: "Type here...",
      })

      expect(element.props.placeholder).toBe("Type here...")
    })

    it("accepts mask prop for password input", () => {
      const element = createElement(TextInput, {
        value: "secret",
        onChange: () => {},
        mask: "*",
      })

      expect(element.props.mask).toBe("*")
    })

    it("accepts autocomplete suggestions", () => {
      const suggestions = ["apple", "apricot", "avocado"]
      const element = createElement(TextInput, {
        value: "a",
        onChange: () => {},
        autocomplete: suggestions,
      })

      expect(element.props.autocomplete).toBe(suggestions)
    })

    it("accepts focused prop", () => {
      const element = createElement(TextInput, {
        value: "test",
        onChange: () => {},
        focused: false,
      })

      expect(element.props.focused).toBe(false)
    })

    it("accepts cursorPosition prop", () => {
      const element = createElement(TextInput, {
        value: "hello",
        onChange: () => {},
        cursorPosition: 2,
      })

      expect(element.props.cursorPosition).toBe(2)
    })

    it("accepts onSubmit callback", () => {
      const onSubmit = () => {}
      const element = createElement(TextInput, {
        value: "test",
        onChange: () => {},
        onSubmit,
      })

      expect(element.props.onSubmit).toBe(onSubmit)
    })

    it("accepts onAutocomplete callback", () => {
      const onAutocomplete = () => {}
      const element = createElement(TextInput, {
        value: "test",
        onChange: () => {},
        onAutocomplete,
      })

      expect(element.props.onAutocomplete).toBe(onAutocomplete)
    })
  })

  describe("useTextInput hook", () => {
    it("is exported as a function", () => {
      expect(typeof useTextInput).toBe("function")
    })
  })
})

describe("TextInput CLI Wrapper", () => {
  describe("createTextInput", () => {
    it("creates input instance with default value", () => {
      const input = createTextInput("Name:", { defaultValue: "John" })

      expect(input.value).toBe("John")
      expect(input.cursorPosition).toBe(4)
    })

    it("creates input instance with empty value by default", () => {
      const input = createTextInput("Name:")

      expect(input.value).toBe("")
      expect(input.cursorPosition).toBe(0)
    })

    it("insert() adds characters at cursor position", () => {
      const input = createTextInput("Name:")
      input.insert("a")
      input.insert("b")

      expect(input.value).toBe("ab")
      expect(input.cursorPosition).toBe(2)
    })

    it("insert() inserts at cursor position, not end", () => {
      const input = createTextInput("Name:", { defaultValue: "ac" })
      input.cursorPosition = 1
      input.insert("b")

      expect(input.value).toBe("abc")
      expect(input.cursorPosition).toBe(2)
    })

    it("backspace() removes character before cursor", () => {
      const input = createTextInput("Name:", { defaultValue: "abc" })
      input.backspace()

      expect(input.value).toBe("ab")
      expect(input.cursorPosition).toBe(2)
    })

    it("backspace() does nothing at position 0", () => {
      const input = createTextInput("Name:", { defaultValue: "abc" })
      input.cursorPosition = 0
      input.backspace()

      expect(input.value).toBe("abc")
      expect(input.cursorPosition).toBe(0)
    })

    it("delete() removes character at cursor", () => {
      const input = createTextInput("Name:", { defaultValue: "abc" })
      input.cursorPosition = 1
      input.delete()

      expect(input.value).toBe("ac")
      expect(input.cursorPosition).toBe(1)
    })

    it("delete() does nothing at end of input", () => {
      const input = createTextInput("Name:", { defaultValue: "abc" })
      input.delete()

      expect(input.value).toBe("abc")
      expect(input.cursorPosition).toBe(3)
    })

    it("clear() resets value and cursor", () => {
      const input = createTextInput("Name:", { defaultValue: "hello" })
      input.clear()

      expect(input.value).toBe("")
      expect(input.cursorPosition).toBe(0)
    })

    it("cursor position is clamped when value changes", () => {
      const input = createTextInput("Name:", { defaultValue: "hello" })
      expect(input.cursorPosition).toBe(5)

      input.value = "hi"
      expect(input.cursorPosition).toBe(2) // clamped to new length
    })

    it("cursor position setter clamps to valid range", () => {
      const input = createTextInput("Name:", { defaultValue: "abc" })

      input.cursorPosition = -5
      expect(input.cursorPosition).toBe(0)

      input.cursorPosition = 100
      expect(input.cursorPosition).toBe(3)
    })

    it("acceptSuggestion() accepts matching autocomplete", () => {
      const input = createTextInput("Fruit:", {
        defaultValue: "app",
        autocomplete: ["apple", "apricot", "banana"],
      })

      input.acceptSuggestion()

      expect(input.value).toBe("apple")
      expect(input.cursorPosition).toBe(5)
    })

    it("acceptSuggestion() does nothing with no match", () => {
      const input = createTextInput("Fruit:", {
        defaultValue: "xyz",
        autocomplete: ["apple", "banana"],
      })

      input.acceptSuggestion()

      expect(input.value).toBe("xyz")
      expect(input.cursorPosition).toBe(3)
    })

    it("acceptSuggestion() does nothing with empty input", () => {
      const input = createTextInput("Fruit:", {
        defaultValue: "",
        autocomplete: ["apple", "banana"],
      })

      input.acceptSuggestion()

      expect(input.value).toBe("")
    })

    it("render() is callable", () => {
      const input = createTextInput("Name:")

      // Should not throw
      expect(() => input.render()).not.toThrow()
    })
  })
})

describe("Autocomplete matching", () => {
  it("matches case-insensitively", () => {
    const input = createTextInput("Fruit:", {
      defaultValue: "APP",
      autocomplete: ["apple", "banana"],
    })

    input.acceptSuggestion()

    expect(input.value).toBe("apple")
  })

  it("finds first matching suggestion", () => {
    const input = createTextInput("Fruit:", {
      defaultValue: "a",
      autocomplete: ["banana", "apple", "apricot"],
    })

    input.acceptSuggestion()

    // "apple" comes before "apricot" in the array order, so we get "apple"
    // Wait, "banana" is first but doesn't match "a" at start
    // Actually "apple" is second and matches
    expect(input.value).toBe("apple")
  })

  it("does not match if suggestion equals input", () => {
    const input = createTextInput("Fruit:", {
      defaultValue: "apple",
      autocomplete: ["apple"],
    })

    input.acceptSuggestion()

    // No change since "apple" exactly equals input (no longer suggestion)
    expect(input.value).toBe("apple")
  })
})
