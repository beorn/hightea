# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Synchronized Update Mode (DEC 2026): all TTY output is wrapped with `CSI ? 2026 h` / `CSI ? 2026 l` for flicker-free rendering. Terminals paint atomically instead of showing intermediate states. Disable with `INKX_SYNC_UPDATE=0`.
- `ANSI.SYNC_BEGIN` and `ANSI.SYNC_END` constants exported from `output.ts`

## [0.1.0] - 2026-02-06

### Added

- Five-phase render pipeline: reconcile, measure, layout, content, output
- `useContentRect()` and `useScreenRect()` hooks for synchronous layout feedback
- React 19 compatible reconciler with Suspense, ErrorBoundary, and useTransition
- Box component with full flexbox props, borders, padding, overflow
- Text component with auto-truncation, extended underlines, and color support
- VirtualList for efficient rendering of large lists
- Console component for capturing and displaying console output
- TextInput and ReadlineInput with full readline shortcuts
- `overflow="scroll"` with `scrollTo` for scrollable containers
- Input layer stack with DOM-style event bubbling (LIFO)
- Plugin composition: withCommands, withKeybindings, withDiagnostics
- Three runtime layers: createRuntime (Elm), run (hooks), createApp (Zustand)
- Terminal rendering modes: fullscreen, inline, static (renderString)
- Pluggable layout engines: Flexx (default) and Yoga (WASM)
- Canvas 2D and DOM render adapters (experimental)
- 28+ unicode utilities (grapheme splitting, display width, CJK, emoji)
- AsyncIterable stream helpers (merge, map, filter, throttle, debounce, batch)
- Playwright-style testing API with locators and auto-refreshing queries
- displayWidth LRU cache (45x faster repeated lookups)
- Buffer-level cellEquals for 3.3x faster "no changes" diffing
- Drop-in Ink compatibility with migration guide

[0.1.0]: https://github.com/beorn/inkx/releases/tag/v0.1.0
