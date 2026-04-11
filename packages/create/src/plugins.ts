/**
 * silvery/plugins — re-exported from @silvery/ag-term/plugins (canonical home).
 *
 * Plugins are functions `(app) => enhancedApp` that compose via `pipe()`:
 *
 * ```tsx
 * import { pipe, withCommands, withKeybindings, withFocus, withDomEvents } from '@silvery/create/plugins'
 *
 * const app = pipe(
 *   baseApp,
 *   withFocus(),
 *   withDomEvents(),
 *   withCommands(cmdOpts),
 *   withKeybindings(kbOpts),
 * )
 *
 * await app.cmd.down()       // Direct command invocation
 * await app.press('j')       // Key -> command -> action
 * ```
 *
 * @packageDocumentation
 */

export * from "@silvery/ag-term/plugins"
