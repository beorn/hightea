/**
 * Progress utilities for CLI applications
 *
 * Provides declarative and fluent APIs for displaying progress during async operations.
 *
 * @example Declarative mode (recommended)
 * ```typescript
 * import { steps, step } from "./index";
 *
 * const loader = steps({
 *   loadModules,           // Auto-named: "Load modules"
 *   loadRepo: {           // Group: "Load repo"
 *     discover,            //   "Discover"
 *     parse,               //   "Parse"
 *   },
 * });
 *
 * const results = await loader.run({ clear: true });
 * ```
 *
 * @example Fluent mode (legacy)
 * ```typescript
 * await steps()
 *   .run("Loading", loadModules)
 *   .run("Building", buildView)
 *   .execute({ clear: true });
 * ```
 */

// Modern API
export {
  steps,
  step,
  type StepBuilder,
  type ExecuteOptions,
  type StepsRunner,
  type StepsDef,
  type StepNode,
  type StepContext,
} from "./steps"

// Re-export CLI progress components
export { Spinner, createSpinner, type CallableSpinner } from "../cli/spinner"
export { ProgressBar } from "../cli/progress-bar"
export { MultiProgress, type TaskHandle } from "../cli/multi-progress"

// Re-export types
export type { ProgressInfo, StepProgress } from "../types.js"
