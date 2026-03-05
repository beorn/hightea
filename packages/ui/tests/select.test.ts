/**
 * Tests for Select component and withSelect wrapper
 */

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { Select, useSelect } from "../src/input/Select.js"
import { withSelect, createSelect } from "../src/wrappers/with-select.js"

describe("Select Component", () => {
  const options = [
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
    { label: "Cherry", value: "cherry" },
  ]

  it("renders with required props", () => {
    const element = createElement(Select, { options })

    expect(element.type).toBe(Select)
    expect(element.props.options).toBe(options)
  })

  it("accepts value and onChange props", () => {
    const onChange = () => {}
    const element = createElement(Select, {
      options,
      value: "banana",
      onChange,
    })

    expect(element.props.value).toBe("banana")
    expect(element.props.onChange).toBe(onChange)
  })

  it("accepts maxVisible prop", () => {
    const element = createElement(Select, {
      options,
      maxVisible: 5,
    })

    expect(element.props.maxVisible).toBe(5)
  })

  it("accepts controlled highlightIndex", () => {
    const element = createElement(Select, {
      options,
      highlightIndex: 1,
      onHighlightChange: () => {},
    })

    expect(element.props.highlightIndex).toBe(1)
  })

  it("works with generic value types", () => {
    interface Item {
      id: number
      name: string
    }

    const typedOptions: Array<{ label: string; value: Item }> = [
      { label: "First", value: { id: 1, name: "first" } },
      { label: "Second", value: { id: 2, name: "second" } },
    ]

    const element = createElement(Select<Item>, {
      options: typedOptions,
      value: { id: 1, name: "first" },
    })

    expect(element.props.options).toBe(typedOptions)
  })
})

describe("useSelect hook", () => {
  it("is exported as a function", () => {
    expect(typeof useSelect).toBe("function")
  })
})

describe("withSelect wrapper", () => {
  it("is exported as a function", () => {
    expect(typeof withSelect).toBe("function")
  })

  it("accepts prompt, options, and optional config", async () => {
    // Type check - verifies the signature is correct
    const _typeCheck: typeof withSelect = async <T>(
      _prompt: string,
      _options: Array<{ label: string; value: T }>,
      _opts?: { initial?: number; maxVisible?: number },
    ) => {
      return _options[0]!.value
    }

    expect(_typeCheck).toBeDefined()
  })
})

describe("createSelect factory", () => {
  it("is exported as a function", () => {
    expect(typeof createSelect).toBe("function")
  })

  it("returns a function", () => {
    const select = createSelect()
    expect(typeof select).toBe("function")
  })

  it("accepts default options", () => {
    const select = createSelect({ maxVisible: 5, initial: 1 })
    expect(typeof select).toBe("function")
  })
})
