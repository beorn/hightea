# Compat Tests

Two layers of Ink/Chalk compatibility testing:

## 1. Real Upstream Tests (authoritative)

Clones the real Ink/Chalk repos and runs their original ava test suites against silvery's compat layer.

```bash
bun run compat           # Both Ink and Chalk
bun run compat:ink       # Ink only
bun run compat:chalk     # Chalk only
```

From km: `bun run test:compat`.

Cached clones at `/tmp/silvery-compat/`. Delete to re-clone. See `packages/compat/scripts/compat-check.ts`.

## 2. Hand-Ported Vitest Tests (fast, integrated)

Local vitest ports of a subset of Ink/Chalk tests. Run as part of `bun run test:vendor`.

```bash
bun vitest run --project vendor vendor/silvery/tests/compat/ink/
bun vitest run --project vendor vendor/silvery/tests/compat/chalk/
```

### Rules for hand-ported tests

- Tests MUST match the real Ink/Chalk tests. Do not modify assertions or add props to make silvery pass — fix the compat layer instead.
- If Ink's `<Box>` relies on its implicit `flexDirection="column"` default, the test must too.
- When in doubt, check the original at `/tmp/silvery-compat/ink/test/<file>.tsx`.

## Analysis Documents

- `ink/ANALYSIS.md` — Categorized failure breakdown with severity and effort estimates
- `ink/RESULTS.md` — Summary of test results and key failure categories

## Current Status

- **Chalk**: 100% compat (32/32 real tests)
- **Ink**: ~72% compat (188/262 real tests)
