# Silvery vs Ink Benchmarks

Head-to-head comparison of Silvery and Ink 7.0 synchronous rerender throughput.

## Run

```bash
bun run bench           # default reporter
bun run bench:compare   # verbose reporter
```

## What's measured

Both frameworks render identical React component trees. Silvery uses `@silvery/test` `createRenderer()` (production render core, headless). Ink uses `render()` with mock stdout or `renderToString()`. Both use mocked stdout — no real terminal I/O.

### Mounted rerender throughput

Both keep a mounted app and call `rerender()` synchronously:

- Cursor move in 20-item list (all visible — no overflow)
- Cursor move in 100-item list
- Move editing marker in kanban board (2 cards change per iteration)
- Memo'd 100-item / 500-item single toggle
- Memo'd kanban 5×20 move editing marker

### Cold renders

Both use their fastest synchronous render path:

- Flat lists (10, 100 items at 80×24 and 200×60)
- Styled lists, kanban boards, deep trees

### Methodology

- **Tooling**: [vitest bench](https://vitest.dev/guide/features#benchmarking) with [mitata](https://github.com/evanwashere/mitata)
- **Ink config**: `debug: true` (synchronous — every `rerender()` does full work, no throttle). `debug: false` uses Ink's lodash-style throttle which batches frames, making per-call comparison unfair
- **Silvery**: `@silvery/test` `createRenderer` uses the same production render core — no test-only code paths
- **I/O**: Both use mocked stdout — no real terminal I/O is measured
- **STRICT mode**: Disabled (`SILVERY_STRICT=0`) to avoid O(cells) verification overhead
- **Ink version**: 7.0.0 (installed as devDependency)
- **Runtime**: Bun (both frameworks). Node.js results pending
- **Fair comparison**: Same React trees, same terminal dimensions, same iteration methodology

## Latest results

See the [Silvery vs Ink comparison page](https://silvery.dev/guide/silvery-vs-ink#performance) for formatted results.

Silvery is 3–6× faster across all mounted rerender scenarios.
