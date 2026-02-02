/**
 * Create the inkx-loop runtime kernel.
 *
 * The runtime owns the event loop, diffing, and output. Users interact via:
 * - events() - AsyncIterable of all events (keys, resize, effects)
 * - schedule() - Queue effects for async execution
 * - render() - Output a buffer (diffing handled internally)
 *
 * NOTE: This runtime is designed for single-consumer use. Calling events()
 * multiple times concurrently will cause events to be split between consumers.
 * Each call returns a fresh AsyncIterable, but they share the underlying queue.
 *
 * @example
 * ```typescript
 * using runtime = createRuntime({ target: termTarget })
 *
 * for await (const event of runtime.events()) {
 *   state = reducer(state, event)
 *   runtime.render(layout(view(state), runtime.getDims()))
 * }
 * ```
 */

import { takeUntil } from '../streams/index.js';
import { diff } from './diff.js';
import type { Buffer, Dims, Event, Runtime, RuntimeOptions } from './types.js';

/**
 * Create a runtime kernel.
 *
 * @param options Runtime configuration
 * @returns Runtime instance implementing Symbol.dispose
 */
export function createRuntime(options: RuntimeOptions): Runtime {
	const { target, signal: externalSignal } = options;

	// Internal abort controller for cleanup
	const controller = new AbortController();
	const signal = controller.signal;

	// Wire external signal if provided - track for cleanup
	let externalAbortHandler: (() => void) | undefined;
	if (externalSignal) {
		if (externalSignal.aborted) {
			controller.abort();
		} else {
			externalAbortHandler = () => controller.abort();
			externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
		}
	}

	// Track previous buffer for diffing
	let prevBuffer: Buffer | null = null;

	// Track if disposed
	let disposed = false;

	// Event queue for scheduled effects and resize events
	const eventQueue: Event[] = [];
	let eventResolve: ((event: Event) => void) | null = null;

	// Push event to queue or resolve pending waiter
	function pushEvent(event: Event): void {
		if (disposed) return;

		if (eventResolve) {
			const resolve = eventResolve;
			eventResolve = null;
			resolve(event);
		} else {
			eventQueue.push(event);
		}
	}

	// Wait for next event (from queue or future push)
	function waitForEvent(): Promise<Event> {
		if (eventQueue.length > 0) {
			return Promise.resolve(eventQueue.shift()!);
		}

		return new Promise<Event>((resolve) => {
			eventResolve = resolve;
		});
	}

	// Subscribe to resize events if supported
	let unsubscribeResize: (() => void) | undefined;
	if (target.onResize) {
		unsubscribeResize = target.onResize((dims) => {
			pushEvent({ type: 'resize', cols: dims.cols, rows: dims.rows });
		});
	}

	// Effect ID counter
	let effectId = 0;

	// Single abort listener for the event loop (created once, not per iteration)
	let abortResolve: (() => void) | undefined;
	const abortPromise = new Promise<null>((resolve) => {
		abortResolve = () => resolve(null);
	});

	// Attach abort listener once
	if (!signal.aborted) {
		signal.addEventListener('abort', () => abortResolve?.(), { once: true });
	}

	// Create internal event source (resize + effects)
	async function* internalEvents(): AsyncGenerator<Event, void, undefined> {
		// If already aborted, exit immediately
		if (signal.aborted) return;

		while (!disposed && !signal.aborted) {
			// Race between abort and next event
			const result = await Promise.race([waitForEvent(), abortPromise]);

			if (result === null) break;
			yield result;
		}
	}

	return {
		events(): AsyncIterable<Event> {
			// Return fresh iterable each call, wrapped with takeUntil for cleanup
			return takeUntil(internalEvents(), signal);
		},

		schedule<T>(effect: () => Promise<T>, opts?: { signal?: AbortSignal }): void {
			if (disposed) return;

			const id = `effect-${effectId++}`;
			const effectSignal = opts?.signal;

			// Check if already aborted
			if (effectSignal?.aborted) return;

			// Execute effect asynchronously
			const execute = async () => {
				// Track abort handler for cleanup
				let abortHandler: (() => void) | undefined;
				let abortReject: ((error: Error) => void) | undefined;

				try {
					if (effectSignal) {
						// Create abort race with cleanup
						const aborted = new Promise<never>((_, reject) => {
							abortReject = reject;
							abortHandler = () => reject(new Error('Effect aborted'));
							effectSignal.addEventListener('abort', abortHandler, { once: true });
						});

						const result = await Promise.race([effect(), aborted]);

						// Clean up abort listener after success
						if (abortHandler) {
							effectSignal.removeEventListener('abort', abortHandler);
						}

						pushEvent({ type: 'effect', id, result });
					} else {
						const result = await effect();
						pushEvent({ type: 'effect', id, result });
					}
				} catch (error) {
					// Clean up abort listener on error too
					if (abortHandler && effectSignal) {
						effectSignal.removeEventListener('abort', abortHandler);
					}

					// Check for abort by name (handles DOMException, AbortError, etc.)
					if (
						error instanceof Error &&
						(error.message === 'Effect aborted' || error.name === 'AbortError')
					) {
						// Silently ignore aborted effects
						return;
					}
					pushEvent({
						type: 'error',
						error: error instanceof Error ? error : new Error(String(error)),
					});
				}
			};

			// Start immediately (microtask)
			queueMicrotask(execute);
		},

		render(buffer: Buffer): void {
			if (disposed) return;

			// Compute diff internally
			const patch = diff(prevBuffer, buffer);
			prevBuffer = buffer;

			// Write to target
			target.write(patch);
		},

		getDims(): Dims {
			return target.getDims();
		},

		[Symbol.dispose](): void {
			if (disposed) return;
			disposed = true;

			// Abort all pending operations
			controller.abort();

			// Remove external signal listener if still attached
			if (externalAbortHandler && externalSignal) {
				externalSignal.removeEventListener('abort', externalAbortHandler);
			}

			// Unsubscribe from resize
			if (unsubscribeResize) {
				unsubscribeResize();
			}

			// Resolve any pending event waiter
			if (eventResolve) {
				eventResolve = null;
			}
		},
	};
}
