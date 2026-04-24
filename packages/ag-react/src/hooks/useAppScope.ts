/**
 * useAppScope — return the root app scope.
 *
 * Set at the app root by `withScope()` (or, in tests, by explicitly
 * providing `AppScopeContext`). Unlike `useScope()`, nesting a
 * `<ScopeProvider>` never changes what this returns — it always resolves
 * to the root, which is what "whole-app shutdown" paths need.
 *
 * Throws if no app scope has been provided. Use `useScope()` for a
 * component-local scope; reach for `useAppScope()` only for imperative
 * whole-app shutdown (e.g. hot-swap a global, trigger exit, route SIGINT
 * into scope disposal).
 */

import { useContext } from "react"
import type { Scope } from "@silvery/scope"
import { AppScopeContext } from "../scope-context"

export function useAppScope(): Scope {
  const app = useContext(AppScopeContext)
  if (!app) {
    throw new Error(
      "useAppScope() called without an app-root scope. " +
        "Wrap the app with withScope() from @silvery/scope or provide " +
        "AppScopeContext explicitly in tests.",
    )
  }
  return app
}
