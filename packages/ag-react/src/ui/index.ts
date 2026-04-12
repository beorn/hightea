/**
 * silvery-ui - UI components for Ink/silvery TUI apps
 *
 * Progress indicators, spinners, and task wrappers for CLI applications.
 *
 * @example
 * ```ts
 * // Fluent task API (recommended)
 * import { task, tasks } from "./progress/index";
 *
 * const data = await task("Loading").wrap(fetchData());
 *
 * const results = await tasks()
 *   .add("Loading", () => fetchData())
 *   .add("Processing", () => process())
 *   .run({ clear: true });
 *
 * // Low-level CLI components
 * import { Spinner, ProgressBar } from "./cli/index";
 *
 * // React/TUI components
 * import { Spinner, ProgressBar } from "./react/index";
 * ```
 *
 * @packageDocumentation
 */

// Re-export everything for convenience
export * from "./types.js"
export * from "./cli/index.js"
export * from "./wrappers/index.js"

// Note: React components should be imported from "./react/index"
// to avoid requiring React as a dependency for CLI-only usage
