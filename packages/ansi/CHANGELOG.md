# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-06

### Added

- Term API with Disposable pattern (`using term = createTerm()`)
- Flattened styling — term IS the style chain (`term.bold.red("text")`)
- Terminal capability detection: `hasCursor()`, `hasInput()`, `hasColor()`, `hasUnicode()`
- Console capture with `patchConsole()` (useSyncExternalStore compatible)
- Capability overrides for testing (`createTerm({ color: null })`)
- Extended underline styles: curly (wavy), dotted, dashed, double
- Independent underline color (RGB, 256-color)
- Combined style + color with `styledUnderline()`
- OSC 8 terminal hyperlinks
- `bgOverride()` for safe chalk background usage with inkx
- Graceful fallback to regular underlines on unsupported terminals
- `stripAnsi()` and `displayLength()` utilities
- Default `term` export for simple scripts
- Storybook for visual testing

[0.1.0]: https://github.com/beorn/chalkx/releases/tag/v0.1.0
