/**
 * Sinon-compatible spy/stub replacements for auto-generated compat tests.
 * Extracted from gen-vitest.ts to avoid duplicating ~35 lines per test file.
 */

export function createSpy(impl?: (...a: unknown[]) => unknown) {
  const calls: unknown[][] = []
  const callBehaviors: Map<number, unknown> = new Map()
  let callIdx = 0
  const fn = (...a: unknown[]) => {
    const idx = callIdx++
    calls.push(a)
    if (callBehaviors.has(idx)) return callBehaviors.get(idx)
    return impl ? impl(...a) : undefined
  }
  return Object.defineProperties(fn, {
    calls: { value: calls },
    callCount: {
      get() {
        return calls.length
      },
    },
    calledOnce: {
      get() {
        return calls.length === 1
      },
    },
    called: {
      get() {
        return calls.length > 0
      },
    },
    firstCall: {
      get() {
        return calls.length > 0 ? { args: calls[0], firstArg: calls[0]![0] } : undefined
      },
    },
    lastCall: {
      get() {
        return calls.length > 0 ? { args: calls.at(-1), firstArg: calls.at(-1)![0] } : undefined
      },
    },
    getCall: {
      value(i: number) {
        return { args: calls[i], firstArg: calls[i]?.[0] }
      },
    },
    getCalls: {
      value() {
        return calls.map((args, i) => ({ args, firstArg: args[0], callId: i }))
      },
    },
    onCall: {
      value(i: number) {
        return {
          returns(v: unknown) {
            callBehaviors.set(i, v)
            return fn
          },
        }
      },
    },
    reset: {
      value() {
        calls.length = 0
        callIdx = 0
        callBehaviors.clear()
      },
    },
    callsFake: {
      value(f: (...a: unknown[]) => unknown) {
        impl = f
        return fn
      },
    },
    returns: {
      value(v: unknown) {
        impl = () => v
        return fn
      },
    },
    resetBehavior: {
      value() {
        impl = undefined
        callBehaviors.clear()
      },
    },
    calledOnceWithExactly: {
      value(...expected: unknown[]) {
        return calls.length === 1 && JSON.stringify(calls[0]) === JSON.stringify(expected)
      },
    },
  }) as any
}

export function spy(...args: unknown[]) {
  return createSpy(args.length > 0 ? () => args[0] : undefined)
}

export function stub(obj?: any, method?: string) {
  if (obj && method) {
    const original = obj[method]
    const s = createSpy(typeof original === "function" ? original.bind(obj) : undefined)
    obj[method] = s
    ;(s as any).restore = () => {
      obj[method] = original
    }
    return s
  }
  return createSpy()
}

export const sinon = {
  spy: createSpy,
  stub,
  useFakeTimers() {
    return {
      clock: Date.now(),
      tick(ms: number) {
        return new Promise((r) => setTimeout(r, ms))
      },
      restore() {},
    }
  },
  match: { any: true },
}
