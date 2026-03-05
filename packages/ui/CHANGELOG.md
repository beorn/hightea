# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Shared ETA calculation utilities (`src/utils/eta.ts`)
- `calculateETA()` function for ETA calculation from sample buffer
- `formatETA()` function for human-readable ETA formatting
- `createETATracker()` factory for managed ETA tracking
- Comprehensive test suite for React components
- Comprehensive test suite for MultiProgress class
- Test suite for ETA utilities
- CONTRIBUTING.md with development guidelines

### Changed

- React ProgressBar and useProgressBar now use shared ETA utilities
- CLI ProgressBar now uses shared ETA utilities
- SPINNER_INTERVALS constant is now exported from `cli/spinner.ts`
- React Spinner component imports SPINNER_INTERVALS from shared location

### Fixed

- Removed dynamic `require()` in ProgressIndicator (ESM compatibility)
- Removed dead code in wrap-generator.ts (unused custom format text)

## [0.1.0] - 2024-01-22

### Added

- Initial release
- CLI Spinner with multiple styles (dots, line, arc, bounce, pulse)
- CLI ProgressBar with ETA, phases, and custom formats
- MultiProgress for concurrent task display
- React components: Spinner, ProgressBar, Task, Tasks
- React hooks: useSpinnerFrame, useProgressBar, useTasks, useProgress
- React context: ProgressProvider, ProgressIndicator
- Wrappers: withSpinner, withProgress, wrapGenerator, wrapEmitter
- Full TypeScript support
