# Tree-Shaking Verification Results

Generated 2026-03-09 by `bun vendor/silvery/tests/tree-shaking/verify.ts`.

## Method

For each entry point, a minimal file importing exports is bundled with `bun build --bundle --target=node`. The output is checked for:

1. **Bundle size** (total bytes after bundling)
2. **React leakage** (does React appear in bundles that should be React-free?)
3. **react-reconciler leakage** (does the reconciler appear where it shouldn't?)

## Results

| Entry Point                  | Bundle Size | React?         | Reconciler?    | Status |
| ---------------------------- | ----------- | -------------- | -------------- | ------ |
| `@silvery/term` (barrel)     | 378.5 KB    | No             | No             | PASS   |
| `@silvery/term` (selective)  | 79.4 KB     | No             | No             | PASS   |
| `@silvery/term/ansi`         | 24.7 KB     | No             | No             | PASS   |
| `@silvery/term/hit-registry` | 42.6 KB     | Yes (expected) | No             | PASS   |
| `@silvery/tea/core`          | 0.2 KB      | No             | No             | PASS   |
| `@silvery/tea/store`         | 2.0 KB      | No             | No             | PASS   |
| `@silvery/tea/tea`           | 0.7 KB      | No             | No             | PASS   |
| `@silvery/tea/streams`       | 1.0 KB      | No             | No             | PASS   |
| `@silvery/theme` (theme.ts)  | 77.3 KB     | Yes (expected) | No             | PASS   |
| `@silvery/react`             | 994.1 KB    | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/term/runtime`      | 854.1 KB    | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/ui/cli`            | 22.9 KB     | No             | No             | PASS   |
| `@silvery/ui/wrappers`       | 18.6 KB     | No             | No             | PASS   |
| `silvery/chalk`              | 17.2 KB     | No             | No             | PASS   |

## Analysis

### `@silvery/term` barrel is React-free

The `@silvery/term` barrel no longer pulls React or react-reconciler. Consumers can `import { createTerm } from "@silvery/term"` without bundling 800KB of React.

Key changes that made this possible:

- **Hit registry split**: Pure logic (HitRegistry class, types, Z_INDEX) stays in barrel via `hit-registry-core.ts`. React hooks/context moved to `hit-registry.ts` (available via `@silvery/term/hit-registry`).
- **withRender removed**: Re-export removed from barrel (available via `@silvery/tea/with-render`).
- **DevTools removed**: `connectDevTools`/`isDevToolsConnected` removed from barrel (available via `@silvery/term/devtools`).
- **measureStats relocated**: Moved from `@silvery/react/reconciler/nodes` to `@silvery/term/pipeline/measure-stats.ts`, breaking the React dependency chain from `layout-phase.ts`.
- **IncrementalRenderMismatchError relocated**: Moved to `errors.ts` so `output-phase.ts` doesn't transitively import `scheduler.ts` (which needs React).
- **Theme imports narrowed**: Pipeline files import from `@silvery/theme/state` and `@silvery/theme/resolve` instead of `@silvery/theme` barrel (which re-exports ThemeContext.tsx).

Barrel size: 378.5 KB (namespace import) / 79.4 KB (selective). The difference is due to bundler including all reachable code for namespace imports even when unused.

### React-free packages work correctly

The leaf packages (`@silvery/term`, `@silvery/term/ansi`, `@silvery/tea/core`, `@silvery/tea/store`, `@silvery/tea/tea`, `@silvery/tea/streams`, `@silvery/ui/cli`, `@silvery/ui/wrappers`, `silvery/chalk`) all bundle without pulling in React.

### `@silvery/term/hit-registry` correctly pulls React

The hit-registry sub-path exports React hooks (`useHitRegion`, `useHitRegionCallback`) and context (`HitRegistryContext`), so React is expected.

### `@silvery/theme` pulls React

`@silvery/theme/theme` (the main barrel) re-exports `ThemeProvider` and `useTheme` from `ThemeContext.tsx`, which imports React. To get a fully React-free theme import, consumers should import individual files (e.g., `@silvery/theme/resolve` for `resolveThemeColor`).

### `@silvery/tea` sub-paths are well-isolated

`tea/core` at 0.2 KB and `tea/streams` at 1.0 KB show excellent isolation. The TEA architecture (pure functions, no React) makes these ideal for server-side or non-UI use.

## Conclusion

All 14 tested entry points pass tree-shaking verification. The `@silvery/term` barrel is React-free, down from 798 KB (with React+reconciler) to 79-379 KB depending on import style.
