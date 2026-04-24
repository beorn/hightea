/**
 * ScopeProvider — make a `Scope` available to descendants.
 *
 * Three modes:
 *
 *   <ScopeProvider scope={s}>         // set current scope only
 *   <ScopeProvider appScope={root}>   // set app-root scope only
 *   <ScopeProvider scope={s} appScope={root}>  // both
 *
 * `withScope()` will, in a later phase, emit the equivalent of the third
 * form at the app root: the same `Scope` value flows into both contexts so
 * `useScope()` and `useAppScope()` both resolve to it. Tests use the
 * explicit form to exercise nested-scope behavior.
 */

import type { ReactNode } from "react"
import type { Scope } from "@silvery/scope"
import { AppScopeContext, ScopeContext } from "./scope-context"

export interface ScopeProviderProps {
  /** Replace the current enclosing scope for descendants. */
  scope?: Scope
  /** Set the app-root scope (only meaningful at the app root). */
  appScope?: Scope
  children?: ReactNode
}

export function ScopeProvider({
  scope,
  appScope,
  children,
}: ScopeProviderProps): React.JSX.Element {
  // Chain providers conditionally so we don't shadow the parent's values
  // with `null` when a given prop wasn't passed. A missing prop means
  // "inherit from parent".
  let tree: React.JSX.Element = <>{children}</>
  if (scope !== undefined) {
    tree = <ScopeContext.Provider value={scope}>{tree}</ScopeContext.Provider>
  }
  if (appScope !== undefined) {
    tree = <AppScopeContext.Provider value={appScope}>{tree}</AppScopeContext.Provider>
  }
  return tree
}
