/**
 * Tests for declarative steps() API
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { steps, step, type StepContext } from "../src/progress/steps.js"
import { generateLabel, parseStepsDef } from "../src/progress/step-node.js"

// Capture stdout to silence spinner output
let originalWrite: typeof process.stdout.write

beforeEach(() => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

describe("generateLabel", () => {
  it("converts camelCase to Title case", () => {
    expect(generateLabel("loadModules")).toBe("Load modules")
    expect(generateLabel("parseMarkdown")).toBe("Parse markdown")
    expect(generateLabel("initBoardStateGenerator")).toBe("Init board state generator")
  })

  it("handles single word", () => {
    expect(generateLabel("load")).toBe("Load")
    expect(generateLabel("parse")).toBe("Parse")
  })

  it("handles already capitalized", () => {
    expect(generateLabel("LoadModules")).toBe("Load modules")
  })
})

describe("parseStepsDef", () => {
  it("parses simple functions", () => {
    function loadModules() {}
    function parseMarkdown() {}

    const nodes = parseStepsDef({ loadModules, parseMarkdown })

    expect(nodes).toHaveLength(2)
    expect(nodes[0]!.label).toBe("Load modules")
    expect(nodes[0]!.key).toBe("loadModules")
    expect(nodes[0]!.work).toBe(loadModules)
    expect(nodes[1]!.label).toBe("Parse markdown")
  })

  it("supports custom names via tuple", () => {
    const fn = () => {}
    const nodes = parseStepsDef({
      step1: ["Custom Label", fn],
    })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.label).toBe("Custom Label")
    expect(nodes[0]!.work).toBe(fn)
  })

  it("creates nested groups", () => {
    const inner1 = () => {}
    const inner2 = () => {}

    const nodes = parseStepsDef({
      outer: {
        inner1,
        inner2,
      },
    })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.label).toBe("Outer")
    expect(nodes[0]!.children).toHaveLength(2)
    expect(nodes[0]!.children![0]!.label).toBe("Inner 1")
    expect(nodes[0]!.children![0]!.indent).toBe(1)
  })
})

describe("declarative steps()", () => {
  it("returns a runner with _steps for inspection", () => {
    function loadModules() {}
    function buildView() {}

    const runner = steps({ loadModules, buildView })

    expect(runner._steps).toHaveLength(2)
    expect(runner._steps[0]!.label).toBe("Load modules")
    expect(runner._steps[1]!.label).toBe("Build view")
  })

  it("run() executes steps sequentially", async () => {
    const order: number[] = []

    const runner = steps({
      step1: async () => {
        order.push(1)
        return "a"
      },
      step2: async () => {
        order.push(2)
        return "b"
      },
    })

    const results = await runner.run({ clear: true })

    expect(order).toEqual([1, 2])
    expect(results.step1).toBe("a")
    expect(results.step2).toBe("b")
  })

  it("pipe() chains outputs to inputs", async () => {
    const runner = steps({
      step1: () => 10,
      step2: ((x: number) => x * 2) as () => number,
      step3: ((x: number) => x + 5) as () => number,
    })

    const result = await runner.pipe({ clear: true })

    expect(result).toBe(25) // (10 * 2) + 5
  })

  it("step() returns no-op outside execution context", () => {
    const ctx = step()

    // Should not throw
    ctx.progress(1, 10)
    ctx.sub("test")
    expect(ctx.label).toBe("")
  })

  it("step() provides context within execution", async () => {
    let captured: StepContext | null = null

    const runner = steps({
      test: () => {
        captured = step()
        return "done"
      },
    })

    await runner.run({ clear: true })

    expect(captured).not.toBeNull()
    expect(captured!.label).toBe("Test")
  })

  it("handles sync generators with sub-steps", async () => {
    function* loadRepo() {
      yield "Discovering files"
      yield { current: 1, total: 10 }
      yield { current: 10, total: 10 }
      yield "Parsing markdown"
      return { files: 10 }
    }

    const runner = steps({ loadRepo })
    const results = await runner.run({ clear: true })

    expect(results.loadRepo).toEqual({ files: 10 })
  })

  it("handles async generators with sub-steps", async () => {
    async function* loadRepo() {
      yield "Discovering files"
      await Promise.resolve()
      yield { current: 5, total: 10 }
      yield "Parsing markdown"
      return { count: 42 }
    }

    const runner = steps({ loadRepo })
    const results = await runner.run({ clear: true })

    expect(results.loadRepo).toEqual({ count: 42 })
  })
})

describe("fluent steps() (legacy)", () => {
  it("still works with no arguments", async () => {
    const results = await steps()
      .run("Step 1", () => "a")
      .run("Step 2", () => "b")
      .execute({ clear: true })

    expect(results["Step 1"]).toBe("a")
    expect(results["Step 2"]).toBe("b")
  })
})
