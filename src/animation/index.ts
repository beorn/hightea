/**
 * Animation Utilities
 *
 * Hooks and helpers for smooth terminal UI animations at ~30fps.
 */

// Easing
export { easings, resolveEasing } from "./easing.js"
export type { EasingFn, EasingName } from "./easing.js"

// Hooks
export { useAnimation } from "./useAnimation.js"
export type { UseAnimationOptions, UseAnimationResult } from "./useAnimation.js"
export { useTransition } from "./useTransition.js"
export type { UseTransitionOptions } from "./useTransition.js"
export { useInterval } from "./useInterval.js"
