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

## 2. Auto-Generated Vitest Tests (fast, integrated)

Auto-generated from Ink's upstream ava test suite via a codemod. Generated tests live in
`tests/compat/ink/generated/` (gitignored — regenerate, don't edit).

```bash
# Generate
bun packages/compat/scripts/gen-vitest.ts

# Run
bun vitest run --project vendor vendor/silvery/tests/compat/ink/generated/
bun vitest run --project vendor vendor/silvery/tests/compat/chalk/
```

The codemod (`gen-vitest.ts`) transforms ink's ava-based tests:
- Replaces ava with an ava-shim backed by vitest (`t.is` → `expect().toBe()`)
- Rewrites imports to use silvery's compat layer
- Marks known failures as `.failing` (EXPECTED_FAILURES, RENDER_MODE_FAILURES)
- Skips files requiring PTY, internal APIs, or kitty keyboard

26 test files generated, 15 skipped. 516 tests pass, 2 skipped.

## Current Status

- **Chalk**: 100% compat (32/32 real tests)
- **Ink**: 98.9% compat (804/813 real tests) — 9 remaining failures are Flexily layout edge cases and minor compat gaps
