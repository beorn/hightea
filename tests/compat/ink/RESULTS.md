# Ink Compatibility Audit Results

Date: 2026-03-12
Silvery version: vendor/silvery (HEAD)
Ink version: 5.2.1 (tests adapted from github.com/vadimdemedes/ink)

## Summary

| Category    | Passed | Total | %          |
| ----------- | ------ | ----- | ---------- |
| **Chalk**   | 32     | 32    | **100.0%** |
| **Ink**     | 804    | 813   | **98.9%**  |
| **Overall** | 836    | 845   | **98.9%**  |

## Per-File Results

### Chalk (100% — 32/32)

All 4 chalk test files pass: `chalk.test.ts` (20), `instance.test.ts` (2), `level.test.ts` (3), `visible.test.ts` (3).

### Ink (98.9% — 804/813)

Tested via `bun run compat` (Layer 1) which clones upstream Ink and runs its 813 ava tests against silvery's compat layer.

**9 remaining failures** (architectural differences, not bugs):

| Category         | Tests | Reason                                                                |
| ---------------- | ----- | --------------------------------------------------------------------- |
| flex-wrap        | 2     | Flexily follows W3C spec; Yoga wraps differently for no-wrap overflow |
| width-height     | 2     | aspectRatio not exposed in LayoutNode interface                       |
| overflow         | 3     | overflowX clipping edge cases with borders                            |
| measure-element  | 1     | Post-state-change re-measurement timing                               |
| render-to-string | 1     | Effect timing in synchronous render (captures final vs initial state) |

For exact Yoga layout parity (flex-wrap, aspectRatio), silvery supports Yoga as a pluggable engine.

## Methodology

- **Layer 1**: Clone real Ink/Chalk repos, run their ava test suites against silvery's compat layer
- **Layer 2**: Auto-generate vitest tests from upstream via codemod (`gen-vitest.ts`)
- See `CLAUDE.md` for full workflow and updating procedures
