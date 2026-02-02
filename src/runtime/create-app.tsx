/**
 * createApp() - Layer 3 entry point for inkx-loop
 *
 * Provides Zustand store integration with flattened providers.
 * Use this when you need shared state across components with
 * fine-grained subscriptions.
 *
 * @example
 * ```tsx
 * import { createApp, useApp } from 'inkx/runtime'
 *
 * const app = createApp(
 *   // Store factory
 *   ({ term }) => (set, get) => ({
 *     count: 0,
 *     increment: () => set(s => ({ count: s.count + 1 })),
 *   }),
 *   // Event handlers (optional)
 *   {
 *     key: (k, { set }) => {
 *       if (k === 'j') set(s => ({ count: s.count + 1 }))
 *       if (k === 'q') return 'exit'
 *     },
 *   }
 * )
 *
 * function Counter() {
 *   const count = useApp(s => s.count)
 *   return <Text>Count: {count}</Text>
 * }
 *
 * await app.run(<Counter />, { term: createTerm() })
 * ```
 */

import process from 'node:process';
import React, {
	createContext,
	useContext,
	useEffect,
	useRef,
	type ReactElement,
} from 'react';
import { createStore, type StateCreator, type StoreApi } from 'zustand';

import { createTerm } from 'chalkx';
import { bufferToText, bufferToStyledText } from '../buffer.js';
import { AppContext, StdoutContext, TermContext } from '../context.js';
import { executeRender } from '../pipeline/index.js';
import { reconciler, createContainer, getContainerRoot } from '../reconciler.js';
import { createRuntime } from './create-runtime.js';
import { ensureLayoutEngine } from './layout.js';
import { parseKey, type Key, type InputHandler } from './keys.js';
import { takeUntil, merge } from '../streams/index.js';
import type { Buffer, Dims, Event, RenderTarget, Runtime } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider interface - has getState/subscribe for state synchronization.
 */
export interface Provider<S = unknown> {
	getState(): S;
	subscribe(listener: (state: S) => void): () => void;
}

/**
 * Check if value is a Provider (duck typing).
 */
function isProvider(value: unknown): value is Provider {
	return (
		value !== null &&
		typeof value === 'object' &&
		'getState' in value &&
		'subscribe' in value &&
		typeof (value as Provider).getState === 'function' &&
		typeof (value as Provider).subscribe === 'function'
	);
}

/**
 * Event handler context passed to handlers.
 */
export interface EventHandlerContext<S> {
	set: StoreApi<S>['setState'];
	get: StoreApi<S>['getState'];
}

/**
 * Event handler function.
 * Return 'exit' to exit the app.
 */
export type EventHandler<T, S> = (
	data: T,
	ctx: EventHandlerContext<S>
) => void | 'exit';

/**
 * Key event handler function with parsed key.
 * Return 'exit' to exit the app.
 */
export type KeyHandler<S> = (
	input: string,
	key: Key,
	ctx: EventHandlerContext<S>
) => void | 'exit';

/**
 * Event handlers map - event name to handler.
 */
export type EventHandlers<S> = {
	key?: KeyHandler<S>;
	resize?: EventHandler<{ cols: number; rows: number }, S>;
	[event: string]: EventHandler<unknown, S> | KeyHandler<S> | undefined;
};

/**
 * Options for app.run().
 */
export interface AppRunOptions {
	/** Terminal dimensions (default: from process.stdout) */
	cols?: number;
	rows?: number;
	/** Standard output (default: process.stdout) */
	stdout?: NodeJS.WriteStream;
	/** Standard input (default: process.stdin) */
	stdin?: NodeJS.ReadStream;
	/** Abort signal for external cleanup */
	signal?: AbortSignal;
	/** Additional providers/values to inject */
	[key: string]: unknown;
}

/**
 * Handle returned by app.run().
 */
export interface AppHandle<S> {
	/** Current rendered text (no ANSI) */
	readonly text: string;
	/** Access to the Zustand store */
	readonly store: StoreApi<S>;
	/** Wait until the app exits */
	waitUntilExit(): Promise<void>;
	/** Unmount and cleanup */
	unmount(): void;
	/** Send a key press */
	press(key: string): Promise<void>;
}

/**
 * App definition returned by createApp().
 */
export interface AppDefinition<S> {
	run(element: ReactElement, options?: AppRunOptions): Promise<AppHandle<S>>;
}

// ============================================================================
// Store Context
// ============================================================================

const StoreContext = createContext<StoreApi<unknown> | null>(null);

/**
 * Hook for accessing app state with selectors.
 *
 * @example
 * ```tsx
 * const count = useApp(s => s.count)
 * const { count, increment } = useApp(s => ({ count: s.count, increment: s.increment }))
 * ```
 */
export function useApp<S, T>(selector: (state: S) => T): T {
	const store = useContext(StoreContext) as StoreApi<S> | null;
	if (!store) throw new Error('useApp must be used within createApp().run()');

	const [state, setState] = React.useState(() => selector(store.getState()));
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	useEffect(() => {
		return store.subscribe((newState) => {
			setState(selectorRef.current(newState));
		});
	}, [store]);

	return state;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create an app with Zustand store and provider integration.
 *
 * This is Layer 3 - it provides:
 * - Zustand store with fine-grained subscriptions
 * - Provider state flattened to store root
 * - Event handlers at app level
 *
 * @param factory Store factory function that receives providers
 * @param handlers Optional event handlers
 */
export function createApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
	factory: (inject: I) => StateCreator<S>,
	handlers?: EventHandlers<S & I>
): AppDefinition<S & I> {
	return {
		async run(element: ReactElement, options: AppRunOptions = {}): Promise<AppHandle<S & I>> {
			const {
				cols = process.stdout.columns || 80,
				rows = process.stdout.rows || 24,
				stdout = process.stdout,
				stdin = process.stdin,
				signal: externalSignal,
				...injectValues
			} = options;

			// Initialize layout engine
			await ensureLayoutEngine();

			// Create abort controller for cleanup
			const controller = new AbortController();
			const signal = controller.signal;

			// Wire external signal
			if (externalSignal) {
				if (externalSignal.aborted) {
					controller.abort();
				} else {
					externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
				}
			}

			// Build injected values with flattened provider state
			const inject = injectValues as I;
			const providerUnsubscribes: (() => void)[] = [];

			// Create store with provider-aware middleware
			const store = createStore<S & I>((set, get, api) => {
				// Get base state from factory
				const baseState = factory(inject)(set as StoreApi<S>['setState'], get as StoreApi<S>['getState'], api as StoreApi<S>);

				// Flatten provider state to root
				const flattenedState: Record<string, unknown> = { ...baseState };

				for (const [name, value] of Object.entries(inject)) {
					if (isProvider(value)) {
						// Get initial provider state
						const providerState = value.getState();
						if (typeof providerState === 'object' && providerState !== null) {
							// Check for collisions
							for (const key of Object.keys(providerState)) {
								if (key in flattenedState) {
									console.warn(`Provider collision: '${key}' defined by both store and provider '${name}'`);
								}
							}
							Object.assign(flattenedState, providerState);
						}

						// Subscribe to provider updates
						const unsub = value.subscribe((newProviderState) => {
							if (typeof newProviderState === 'object' && newProviderState !== null) {
								set(newProviderState as Partial<S & I>);
							}
						});
						providerUnsubscribes.push(unsub);

						// Keep provider object accessible
						flattenedState[name] = value;
					} else {
						// Plain value - goes to root
						flattenedState[name] = value;
					}
				}

				return flattenedState as S & I;
			});

			// Track current dimensions
			let currentDims: Dims = { cols, rows };
			let shouldExit = false;

			// Create keyboard event source
			function createKeyboardSource(): AsyncIterable<Event> {
				return {
					async *[Symbol.asyncIterator]() {
						if (!stdin.isTTY) return;

						stdin.setRawMode(true);
						stdin.resume();
						stdin.setEncoding('utf8');

						try {
							while (!signal.aborted) {
								const rawKey = await new Promise<string | null>((resolve) => {
									const onData = (data: string) => {
										stdin.off('data', onData);
										resolve(data);
									};
									const onAbort = () => {
										stdin.off('data', onData);
										resolve(null);
									};
									stdin.on('data', onData);
									signal.addEventListener('abort', onAbort, { once: true });
								});

								if (rawKey === null || signal.aborted) break;

								// Parse the key using full key parsing
								const [input, key] = parseKey(rawKey);

								yield {
									type: 'key' as const,
									key: rawKey,
									input,
									parsedKey: key,
									ctrl: key.ctrl,
									meta: key.meta,
									shift: key.shift,
								};
							}
						} finally {
							if (stdin.isTTY) {
								stdin.setRawMode(false);
								stdin.pause();
							}
						}
					},
				};
			}

			// Create render target
			const target: RenderTarget = {
				write(frame: string): void {
					stdout.write(frame);
				},
				getDims(): Dims {
					return currentDims;
				},
				onResize(handler: (dims: Dims) => void): () => void {
					const onResize = () => {
						currentDims = {
							cols: stdout.columns || 80,
							rows: stdout.rows || 24,
						};
						handler(currentDims);
					};
					stdout.on('resize', onResize);
					return () => stdout.off('resize', onResize);
				},
			};

			// Create runtime
			const runtime = createRuntime({ target, signal });

			// Exit function
			const exit = () => {
				shouldExit = true;
				controller.abort();
			};

			// Create InkxNode container
			const container = createContainer(() => {});

			// Create React fiber root
			const fiberRoot = reconciler.createContainer(
				container,
				0,
				null,
				false,
				null,
				'',
				() => {},
				null,
			);

			// Track current buffer for text access
			let currentText = '';

			// Create mock stdout for contexts
			const mockStdout = {
				columns: cols,
				rows: rows,
				write: () => true,
				isTTY: false,
				on: () => mockStdout,
				off: () => mockStdout,
				once: () => mockStdout,
				removeListener: () => mockStdout,
				addListener: () => mockStdout,
			} as unknown as NodeJS.WriteStream;

			// Create mock term
			const mockTerm = createTerm({ level: 3, columns: cols });

			// Wrap element with all required providers
			const wrappedElement = (
				<TermContext.Provider value={mockTerm}>
					<AppContext.Provider value={{ exit }}>
						<StdoutContext.Provider value={{ stdout: mockStdout, write: () => {} }}>
							<StoreContext.Provider value={store as StoreApi<unknown>}>
								{element}
							</StoreContext.Provider>
						</StdoutContext.Provider>
					</AppContext.Provider>
				</TermContext.Provider>
			);

			// Helper to render and get text
			function doRender(): Buffer {
				reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {});
				reconciler.flushSyncWork();

				const rootNode = getContainerRoot(container);
				const dims = runtime.getDims();
				const { buffer: termBuffer } = executeRender(rootNode, dims.cols, dims.rows, null, {
					skipLayoutNotifications: true,
				});

				const text = bufferToText(termBuffer);
				const ansi = bufferToStyledText(termBuffer);

				return {
					text,
					ansi,
					nodes: rootNode,
					_buffer: termBuffer,
				};
			}

			// Initial render
			const buffer = doRender();
			currentText = buffer.text;

			// Clear screen and hide cursor
			stdout.write('\x1b[2J\x1b[H\x1b[?25l');
			runtime.render(buffer);

			// Exit promise
			let exitResolve: () => void;
			const exitPromise = new Promise<void>((resolve) => {
				exitResolve = resolve;
			});

			// Subscribe to store for re-renders
			const storeUnsubscribe = store.subscribe(() => {
				if (!shouldExit) {
					const newBuffer = doRender();
					currentText = newBuffer.text;
					runtime.render(newBuffer);
				}
			});

			// Start event loop
			const eventLoop = async () => {
				const keyboardEvents = createKeyboardSource();
				const runtimeEvents = runtime.events();
				const allEvents = merge(keyboardEvents, runtimeEvents);

				try {
					for await (const event of takeUntil(allEvents, signal)) {
						if (shouldExit) break;

						// Handle key events with app-level handlers
						if (event.type === 'key' && 'parsedKey' in event && handlers?.key) {
							const { input, parsedKey } = event as { input: string; parsedKey: Key };
							const result = handlers.key(input, parsedKey, {
								set: store.setState,
								get: store.getState,
							});
							if (result === 'exit') {
								exit();
								break;
							}
						}

						// Handle resize events
						if (event.type === 'resize' && handlers?.resize) {
							const resizeHandler = handlers.resize as EventHandler<{ cols: number; rows: number }, S & I>;
							resizeHandler(event as { cols: number; rows: number }, {
								set: store.setState,
								get: store.getState,
							});
						}

						// Re-render (store subscription handles this, but also trigger manually for events)
						const newBuffer = doRender();
						currentText = newBuffer.text;
						runtime.render(newBuffer);

						if (shouldExit) break;
					}
				} finally {
					// Cleanup
					storeUnsubscribe();
					providerUnsubscribes.forEach(unsub => unsub());
					runtime[Symbol.dispose]();
					stdout.write('\x1b[?25h\x1b[0m\n');
					exitResolve();
				}
			};

			// Start loop in background
			eventLoop().catch(console.error);

			// Return handle
			return {
				get text() {
					return currentText;
				},
				get store() {
					return store;
				},
				waitUntilExit() {
					return exitPromise;
				},
				unmount() {
					exit();
				},
				async press(rawKey: string) {
					// Parse the key
					const [input, parsedKey] = parseKey(rawKey);

					// Call handler if exists
					if (handlers?.key) {
						const result = handlers.key(input, parsedKey, {
							set: store.setState,
							get: store.getState,
						});
						if (result === 'exit') {
							exit();
							return;
						}
					}
					// Trigger re-render
					const newBuffer = doRender();
					currentText = newBuffer.text;
					await Promise.resolve();
				},
			};
		},
	};
}
