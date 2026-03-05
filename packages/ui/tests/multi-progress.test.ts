/**
 * Tests for MultiProgress class
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "vitest"
import { MultiProgress } from "../src/cli/multi-progress.js"
import { PassThrough } from "stream"

/**
 * Create a mock stream for testing
 * Uses PassThrough which is a non-TTY stream
 */
function createMockStream(): PassThrough & { isTTY?: boolean } {
  return new PassThrough()
}

/**
 * Create a mock TTY stream for testing
 */
function createMockTTY(): PassThrough & { isTTY: boolean } {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean }
  stream.isTTY = true
  return stream
}

describe("MultiProgress", () => {
  describe("constructor", () => {
    it("accepts custom stream", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)
      expect(multi).toBeDefined()
    })

    it("uses process.stdout by default", () => {
      const multi = new MultiProgress()
      expect(multi).toBeDefined()
    })
  })

  describe("add", () => {
    it("adds a spinner task by default", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const task = multi.add("Loading")

      expect(task).toBeDefined()
      expect(task.status).toBe("pending")
    })

    it("adds a bar task with total", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const task = multi.add("Processing", { type: "bar", total: 100 })

      expect(task).toBeDefined()
      expect(task.status).toBe("pending")
    })

    it("accepts spinnerStyle option", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const task = multi.add("Scanning", {
        type: "spinner",
        spinnerStyle: "arc",
      })

      expect(task).toBeDefined()
    })

    it("adds multiple tasks in order", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const task1 = multi.add("Task 1")
      const task2 = multi.add("Task 2")
      const task3 = multi.add("Task 3")

      expect(task1.status).toBe("pending")
      expect(task2.status).toBe("pending")
      expect(task3.status).toBe("pending")
    })
  })

  describe("start/stop", () => {
    it("start returns the MultiProgress instance", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const result = multi.start()

      expect(result).toBe(multi)
      multi.stop()
    })

    it("stop returns the MultiProgress instance", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      multi.start()
      const result = multi.stop()

      expect(result).toBe(multi)
    })

    it("stop is idempotent", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      multi.start()
      multi.stop()
      const result = multi.stop() // Should not throw

      expect(result).toBe(multi)
    })

    it("start is idempotent", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      multi.start()
      const result = multi.start() // Should not throw

      expect(result).toBe(multi)
      multi.stop()
    })
  })

  describe("TaskHandle", () => {
    describe("start", () => {
      it("changes status to running", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        expect(task.status).toBe("pending")

        task.start()

        expect(task.status).toBe("running")
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        const result = task.start()

        expect(result).toBe(task)
      })
    })

    describe("complete", () => {
      it("changes status to completed", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.start()
        task.complete()

        expect(task.status).toBe("completed")
      })

      it("accepts optional new title", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.start()
        task.complete("Done!")

        expect(task.status).toBe("completed")
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        const result = task.complete()

        expect(result).toBe(task)
      })
    })

    describe("fail", () => {
      it("changes status to failed", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.start()
        task.fail()

        expect(task.status).toBe("failed")
      })

      it("accepts optional new title", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.start()
        task.fail("Error occurred")

        expect(task.status).toBe("failed")
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        const result = task.fail()

        expect(result).toBe(task)
      })
    })

    describe("skip", () => {
      it("changes status to skipped", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.skip()

        expect(task.status).toBe("skipped")
      })

      it("accepts optional new title", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        task.skip("Skipped - not needed")

        expect(task.status).toBe("skipped")
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test task")

        const result = task.skip()

        expect(result).toBe(task)
      })
    })

    describe("update", () => {
      it("updates current progress value", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Processing", { type: "bar", total: 100 })

        task.start()
        task.update(50)

        // Verify via _getTask internal method
        const taskState = (multi as any)._getTask((task as any).id)
        expect(taskState.current).toBe(50)
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Processing", { type: "bar", total: 100 })

        const result = task.update(25)

        expect(result).toBe(task)
      })
    })

    describe("setTitle", () => {
      it("updates task title", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Initial title")

        task.setTitle("Updated title")

        // Verify via _getTask internal method
        const taskState = (multi as any)._getTask((task as any).id)
        expect(taskState.title).toBe("Updated title")
      })

      it("is chainable", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test")

        const result = task.setTitle("New title")

        expect(result).toBe(task)
      })
    })

    describe("status", () => {
      it("returns pending for new tasks", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test")

        expect(task.status).toBe("pending")
      })

      it("tracks status changes through transitions", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Test")

        expect(task.status).toBe("pending")

        task.start()
        expect(task.status).toBe("running")

        task.complete()
        expect(task.status).toBe("completed")
      })
    })

    describe("chaining", () => {
      it("supports fluent API", () => {
        const stream = createMockStream()
        const multi = new MultiProgress(stream as any)
        const task = multi.add("Chained task", { type: "bar", total: 100 })

        // All methods should be chainable
        task.start().update(25).update(50).setTitle("Almost done").complete("Done!")

        expect(task.status).toBe("completed")
      })
    })
  })

  describe("concurrent tasks", () => {
    it("tracks multiple tasks independently", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const task1 = multi.add("Task 1")
      const task2 = multi.add("Task 2")
      const task3 = multi.add("Task 3")

      task1.start()
      task2.start()

      expect(task1.status).toBe("running")
      expect(task2.status).toBe("running")
      expect(task3.status).toBe("pending")

      task1.complete()
      task3.skip()

      expect(task1.status).toBe("completed")
      expect(task2.status).toBe("running")
      expect(task3.status).toBe("skipped")
    })

    it("handles mixed spinner and bar tasks", () => {
      const stream = createMockStream()
      const multi = new MultiProgress(stream as any)

      const spinner1 = multi.add("Scanning", { type: "spinner" })
      const bar1 = multi.add("Downloading", { type: "bar", total: 100 })
      const spinner2 = multi.add("Processing", { type: "spinner" })

      spinner1.start()
      bar1.start()
      bar1.update(50)
      spinner1.complete()
      spinner2.start()

      expect(spinner1.status).toBe("completed")
      expect(bar1.status).toBe("running")
      expect(spinner2.status).toBe("running")
    })
  })
})
