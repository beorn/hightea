/**
 * withLinks - SlateJS-style plugin for link event handling
 *
 * Subscribes to `link:open` events from the runtime event bus and routes
 * them to a handler function. Link components (see Link.tsx) emit these
 * events on Cmd+click — this plugin connects the dots at the App level.
 *
 * Keeps silvery runtime-agnostic: the plugin doesn't know how to open URLs
 * or navigate internally — the handler decides. Platform-specific behavior
 * (e.g., `open` on macOS, `xdg-open` on Linux) belongs in the app's handler.
 *
 * @example
 * ```tsx
 * const app = pipe(
 *   baseApp,
 *   withLinks({
 *     eventBus: runtimeContextValue,
 *     onOpen: (href) => {
 *       if (href.startsWith('http')) openExternal(href)
 *       else navigateToNode(href)
 *     },
 *   }),
 * )
 * ```
 *
 * @example Direct
 * ```tsx
 * const app = withLinks(baseApp, {
 *   eventBus: runtimeContextValue,
 *   onOpen: (href) => handleLink(href),
 * })
 * ```
 */

import type { App } from "@silvery/ag-term/app"

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal event bus interface — matches RuntimeContextValue's on/emit.
 *
 * Only requires `on()` for subscribing. The `emit()` side is handled
 * by Link.tsx inside React — the plugin is a consumer, not a producer.
 */
export interface LinkEventBus {
  on(event: string, handler: (...args: unknown[]) => void): () => void
}

/**
 * Link handler function. Receives the href from a link:open event.
 *
 * The handler is responsible for routing:
 * - External URLs (http/https) → OS-level open
 * - Internal links (km://, custom schemes) → app navigation
 * - Unknown schemes → ignore or log
 */
export type LinkHandler = (href: string) => void

/**
 * Options for withLinks.
 */
export interface WithLinksOptions {
  /** Event bus to subscribe to (RuntimeContextValue or compatible) */
  eventBus: LinkEventBus
  /** Handler for link:open events */
  onOpen: LinkHandler
}

/**
 * App enhanced with link handling.
 */
export type AppWithLinks = App & {
  /** Link handler — can be swapped at runtime */
  links: {
    /** Current handler for link:open events */
    onOpen: LinkHandler
    /** Unsubscribe from link:open events (called automatically on dispose) */
    dispose: () => void
  }
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Add link event handling to an App.
 *
 * Supports two calling styles:
 * - Direct: `withLinks(app, options)` — returns enhanced app immediately
 * - Curried: `withLinks(options)` — returns a plugin for pipe() composition
 *
 * @example Direct
 * ```tsx
 * const app = withLinks(baseApp, {
 *   eventBus: runtimeContextValue,
 *   onOpen: (href) => handleLink(href),
 * })
 * ```
 *
 * @example Curried (pipe)
 * ```tsx
 * const app = pipe(
 *   baseApp,
 *   withLinks({
 *     eventBus: runtimeContextValue,
 *     onOpen: (href) => handleLink(href),
 *   }),
 * )
 * ```
 */
// Curried form: withLinks(options) => plugin
export function withLinks(options: WithLinksOptions): (app: App) => AppWithLinks
// Direct form: withLinks(app, options) => enhancedApp
export function withLinks(app: App, options: WithLinksOptions): AppWithLinks
export function withLinks(
  appOrOptions: App | WithLinksOptions,
  maybeOptions?: WithLinksOptions,
): AppWithLinks | ((app: App) => AppWithLinks) {
  // Curried form: first arg is options (no press/text/ansi = not an App)
  if (maybeOptions === undefined) {
    const options = appOrOptions as WithLinksOptions
    return (app: App) => applyLinks(app, options)
  }
  // Direct form: first arg is app
  return applyLinks(appOrOptions as App, maybeOptions)
}

function applyLinks(app: App, options: WithLinksOptions): AppWithLinks {
  const { eventBus, onOpen } = options

  // Mutable handler — can be swapped at runtime for dynamic routing
  let handler: LinkHandler = onOpen

  // Subscribe to link:open events from the runtime event bus
  const unsubscribe = eventBus.on("link:open", (href: unknown) => {
    if (typeof href === "string") {
      handler(href)
    }
  })

  // Links API exposed on the enhanced app
  const links = {
    get onOpen(): LinkHandler {
      return handler
    },
    set onOpen(fn: LinkHandler) {
      handler = fn
    },
    dispose: unsubscribe,
  }

  return Object.assign(app, { links }) as AppWithLinks
}
