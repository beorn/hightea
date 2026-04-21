/**
 * Progress wrappers - Adapt existing async patterns
 *
 * @example
 * ```ts
 * import {
 *   withSpinner,
 *   wrapGenerator,
 *   wrapEmitter
 * } from "./index";
 *
 * // Wrap any promise
 * const data = await withSpinner(fetchData(), "Loading...");
 *
 * // Wrap generators
 * await wrapGenerator(evaluateAllRules(), "Evaluating rules");
 *
 * // Track EventEmitter state
 * wrapEmitter(manager, { events: { ready: { succeed: true } } });
 * ```
 */

export { withSpinner, attachSpinner } from "./with-spinner"
export { wrapGenerator, withIterableProgress } from "./wrap-generator"
export { wrapEmitter, waitForEvent } from "./wrap-emitter"
export { withSelect, createSelect } from "./with-select"
export { withTextInput, createTextInput } from "./with-text-input"
export type { ProgressCallback, ProgressInfo, TextInputOptions } from "../types.js"
