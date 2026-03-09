# Tree-Shaking Verification Results

Generated 2026-03-09 by `bun vendor/silvery/tests/tree-shaking/verify.ts`.

## Method

For each entry point, a minimal file importing a few exports is bundled with `bun build --bundle --target=node`. The output is checked for:

1. **Bundle size** (total bytes after bundling)
2. **React leakage** (does React appear in bundles that should be React-free?)
3. **react-reconciler leakage** (does the reconciler appear where it shouldn't?)

## Results

| Entry Point                 | Bundle Size | React?         | Reconciler?    | Status |
| --------------------------- | ----------- | -------------- | -------------- | ------ |
| `@silvery/ansi`             | 24.7 KB     | No             | No             | PASS   |
| `@silvery/tea/core`         | 0.2 KB      | No             | No             | PASS   |
| `@silvery/tea/store`        | 2.0 KB      | No             | No             | PASS   |
| `@silvery/tea/tea`          | 0.7 KB      | No             | No             | PASS   |
| `@silvery/tea/streams`      | 1.0 KB      | No             | No             | PASS   |
| `@silvery/theme` (theme.ts) | 77.3 KB     | Yes (expected) | No             | PASS   |
| `@silvery/react`            | 1008.9 KB   | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/term/runtime`     | 863.5 KB    | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/ui/cli`           | 22.9 KB     | No             | No             | PASS   |
| `@silvery/ui/wrappers`      | 18.6 KB     | No             | No             | PASS   |
| `silvery/chalk`             | 17.2 KB     | No             | No             | PASS   |

## Analysis

### React-free packages work correctly

The leaf packages (`@silvery/ansi`, `@silvery/tea/core`, `@silvery/tea/store`, `@silvery/tea/tea`, `@silvery/tea/streams`, `@silvery/ui/cli`, `@silvery/ui/wrappers`, `silvery/chalk`) all bundle without pulling in React. This confirms the package boundary design is working: pure-TypeScript packages don't accidentally depend on React.

### `@silvery/theme` pulls React

`@silvery/theme/theme` (the main barrel) re-exports `ThemeProvider` and `useTheme` from `ThemeContext.tsx`, which imports React. To get a fully React-free theme import, consumers would need to import individual files via the wildcard (e.g., `@silvery/theme/resolve` for `resolveThemeColor`).

**Potential improvement**: Split `@silvery/theme` exports into a React-free sub-path (e.g., `@silvery/theme/core` with just types, palettes, color utils, resolve) and keep React parts in the main entry or a `/react` sub-path.

### `@silvery/react` and `@silvery/term/runtime` are large

Both are ~860-1009 KB bundled, which is expected given they contain the full React reconciler, layout engine, render pipeline, and component library. The `@silvery/react` barrel re-exports from all other packages, so its bundle size represents the "everything included" cost.

### `@silvery/tea` sub-paths are well-isolated

`tea/core` at 0.2 KB and `tea/streams` at 1.0 KB show excellent isolation. The TEA architecture (pure functions, no React) makes these ideal for server-side or non-UI use.

## Conclusion

Tree-shaking boundaries are healthy. All 11 tested entry points passed. The main concern is `@silvery/theme` dragging React for consumers who only want color utilities.
