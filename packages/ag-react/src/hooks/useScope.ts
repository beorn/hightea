/**
 * useScope — return the nearest enclosing `Scope` from React context.
 *
 * The first `<ScopeProvider>` ancestor wins. If there is no provider but the
 * app has been wrapped with `withScope()` (which also populates
 * `AppScopeContext`), the root app scope is returned. If neither is present
 * we throw — calling `useScope()` without any ancestor scope is always a
 * misconfiguration and silent fallback would just defer the failure to the
 * first `scope.use(...)` / `scope.defer(...)` call.
 *
 * Render-phase rule: **never call `scope.use / defer / child /
 * [Symbol.asyncDispose]` from a component body**. The hook returns the
 * scope so you can pass it to event handlers, but acquisition belongs in
 * `useScopeEffect` (post-commit). See
 * `hub/silvery/design/lifecycle-scope.md` §"Render-phase rule".
 */

import { useContext } from "react"
import type { Scope } from "@silvery/scope"
import { AppScopeContext, ScopeContext } from "../scope-context"

export function useScope(): Scope {
  const current = useContext(ScopeContext)
  if (current) return current

  const app = useContext(AppScopeContext)
  if (app) return app

  throw new Error(
    "useScope() called without a <ScopeProvider> ancestor or app-root scope. " +
      "Wrap your app with withScope() (see @silvery/scope) or render under " +
      "<ScopeProvider scope={...}>.",
  )
}
