/**
 * ScopeContext — plumbs `Scope` down the React tree.
 *
 * Two contexts intentionally:
 *
 * - `ScopeContext` carries the *current* enclosing scope. Nested
 *   `<ScopeProvider scope={...}>` elements shadow it. `useScope()` reads this.
 *
 * - `AppScopeContext` carries the *root app scope*. It is set exactly once,
 *   at the app root, by `withScope()` (wired into `createApp()` in a later
 *   phase) or by `<ScopeProvider scope={root} appScope={root}>` in tests.
 *   `useAppScope()` reads this so whole-app shutdown paths always reach the
 *   root even from deeply nested components.
 *
 * Separating them matters: nesting a `<ScopeProvider>` must not change what
 * `useAppScope()` returns — only `useScope()`.
 */

import { createContext } from "react"
import type { Scope } from "@silvery/scope"

/** Current enclosing scope. `null` when no provider is above the component. */
export const ScopeContext = createContext<Scope | null>(null)

/** Root app scope. Set once by `withScope()` (or in tests). */
export const AppScopeContext = createContext<Scope | null>(null)
