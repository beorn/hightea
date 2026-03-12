/**
 * Ava → Vitest shim.
 *
 * Provides ava's test API (`t.is`, `t.true`, `t.deepEqual`, etc.) backed by
 * vitest's `expect`. This lets us run ink's ava-based tests with minimal
 * source transforms (just import rewrites, no assertion changes).
 */
import { test as vitestTest, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"

type TestContext = {
  is: (actual: unknown, expected: unknown, message?: string) => void
  not: (actual: unknown, expected: unknown, message?: string) => void
  true: (value: unknown, message?: string) => void
  false: (value: unknown, message?: string) => void
  truthy: (value: unknown, message?: string) => void
  falsy: (value: unknown, message?: string) => void
  deepEqual: (actual: unknown, expected: unknown, message?: string) => void
  notDeepEqual: (actual: unknown, expected: unknown, message?: string) => void
  like: (actual: unknown, expected: unknown, message?: string) => void
  throws: (
    fn: () => void,
    expectations?: { message?: string | RegExp; instanceOf?: Function },
    message?: string,
  ) => void
  throwsAsync: (
    fn: () => Promise<void>,
    expectations?: { message?: string | RegExp; instanceOf?: Function },
    message?: string,
  ) => Promise<unknown>
  notThrows: (fn: () => void, message?: string) => void
  notThrowsAsync: (fn: () => Promise<void>, message?: string) => Promise<void>
  regex: (str: string, regex: RegExp, message?: string) => void
  notRegex: (str: string, regex: RegExp, message?: string) => void
  pass: (message?: string) => void
  fail: (message?: string) => void
  log: (...args: unknown[]) => void
  snapshot: (value: unknown, message?: string) => void
  teardown: (fn: () => void | Promise<void>) => void
  timeout: (ms: number) => void
  try: (
    fn: (tt: TestContext) => void | Promise<void>,
  ) => Promise<{ passed: boolean; commit: () => void; discard: () => void }>
}

function createContext(): TestContext {
  const teardowns: (() => void | Promise<void>)[] = []
  const ctx: TestContext = {
    is(actual, expected, message) {
      expect(actual, message).toBe(expected)
    },
    not(actual, expected, message) {
      expect(actual, message).not.toBe(expected)
    },
    true(value, message) {
      expect(value, message).toBe(true)
    },
    false(value, message) {
      expect(value, message).toBe(false)
    },
    truthy(value, message) {
      expect(value, message).toBeTruthy()
    },
    falsy(value, message) {
      expect(value, message).toBeFalsy()
    },
    deepEqual(actual, expected, message) {
      expect(actual, message).toEqual(expected)
    },
    notDeepEqual(actual, expected, message) {
      expect(actual, message).not.toEqual(expected)
    },
    like(actual, expected, message) {
      expect(actual, message).toMatchObject(expected as Record<string, unknown>)
    },
    throws(fn, expectations, message) {
      if (expectations?.message) {
        expect(fn, message).toThrow(expectations.message)
      } else {
        expect(fn, message).toThrow()
      }
    },
    async throwsAsync(fn, expectations, message) {
      if (expectations?.message) {
        await expect(fn(), message).rejects.toThrow(expectations.message)
      } else {
        await expect(fn(), message).rejects.toThrow()
      }
    },
    notThrows(fn, message) {
      expect(fn, message).not.toThrow()
    },
    async notThrowsAsync(fn, message) {
      await expect(fn(), message).resolves.not.toThrow()
    },
    regex(str, regex, message) {
      expect(str, message).toMatch(regex)
    },
    notRegex(str, regex, message) {
      expect(str, message).not.toMatch(regex)
    },
    pass(_message) {
      // noop — test passes by not throwing
    },
    fail(message) {
      throw new Error(message ?? "Test failed")
    },
    log(...args) {
      // ava's t.log — just console.log in vitest
      console.log(...args)
    },
    snapshot(_value, _message) {
      // Snapshots not supported in generated tests
    },
    teardown(fn) {
      teardowns.push(fn)
    },
    timeout(_ms) {
      // vitest handles timeouts at the test level — noop
    },
    async try(fn) {
      let passed = true
      let error: unknown
      const tt = createContext()
      try {
        await fn(tt)
      } catch (e) {
        passed = false
        error = e
      }
      return {
        passed,
        commit() {
          if (!passed) throw error
        },
        discard() {
          // noop — discard the failed attempt
        },
      }
    },
  }
  // Attach teardowns for the wrapper to call
  ;(ctx as any).__teardowns = teardowns
  return ctx
}

type TestFn = (t: TestContext) => void | Promise<void>

function createTest(vitestFn: typeof vitestTest): ((name: string, fn: TestFn) => void) & {
  serial: (name: string, fn: TestFn) => void
  failing: (name: string, fn: TestFn) => void
  todo: (name: string) => void
  skip: (name: string, fn?: TestFn) => void
  before: (fn: TestFn) => void
  after: (fn: TestFn) => void
  beforeEach: (fn: TestFn) => void
  afterEach: (fn: TestFn) => void
} {
  const runWithTeardown = async (fn: TestFn) => {
    const t = createContext()
    try {
      await fn(t)
    } finally {
      const teardowns = (t as any).__teardowns as (() => void | Promise<void>)[]
      for (const td of teardowns.reverse()) await td()
    }
  }

  const wrapper = (name: string, fn: TestFn) => {
    vitestFn(name, () => runWithTeardown(fn))
  }

  wrapper.serial = wrapper // vitest runs serially by default in a file
  wrapper.failing = (name: string, fn: TestFn) => {
    vitestFn.fails(name, () => runWithTeardown(fn))
  }
  wrapper.todo = (name: string) => {
    vitestFn.todo(name)
  }
  wrapper.skip = (name: string, _fn?: TestFn) => {
    vitestFn.skip(name, () => {})
  }
  wrapper.before = (fn: TestFn) => {
    beforeAll(() => runWithTeardown(fn))
  }
  wrapper.after = (fn: TestFn) => {
    afterAll(() => runWithTeardown(fn))
  }
  wrapper.beforeEach = (fn: TestFn) => {
    beforeEach(() => runWithTeardown(fn))
  }
  wrapper.afterEach = (fn: TestFn) => {
    afterEach(() => runWithTeardown(fn))
  }

  return wrapper
}

export const test = createTest(vitestTest)
export default test
export type { TestContext as ExecutionContext }
