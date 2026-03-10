# Plugin Architecture: withReact() + withInk()

## Status: Design Proposal

## Problem

Silvery has three entry points for rendering React elements, each with its own provider stack:

1. **`render()`** (test renderer, `renderer.ts`) — wraps with `CursorProvider > TermContext > StdoutContext > FocusManagerContext > RuntimeContext`, plus optional `wrapRoot` callback
2. **`run()`** / **`createApp()`** (runtime, `create-app.tsx`) — wraps with `CursorProvider > TermContext > StdoutContext > FocusManagerContext > RuntimeContext`, hardcoded
3. **`renderToXterm()`** (xterm, `xterm/index.ts`) — no provider wrapping at all
4. **Ink compat** (`ink.ts`) — reimplements provider wrapping: `CursorProvider > InkCursorStoreCtx > InkFocusProvider > InkErrorBoundary`, applied via `wrapRoot`

Problems:

- **Duplication**: Each entry point builds its own provider tree, with slight variations
- **Ink reimplements**: The compat layer reimplements ~300 lines of render pipeline to add its providers
- **No extension point**: `run()`/`createApp()` have no `wrapRoot` — apps can't inject providers
- **xterm has nothing**: Web showcases have no access to silvery's focus management, cursor tracking, etc.

## Proposed Solution: Composable Plugins

A plugin is a function that wraps a React element with additional providers/behavior:

```typescript
type Plugin = (element: ReactElement) => ReactElement
```

### Built-in Plugins

```typescript
// Core React reconciler contexts (always applied)
function withSilvery(opts: { term: Term; focusManager?: FocusManager; cursorStore?: CursorStore }): Plugin {
  return (el) =>
    createElement(
      CursorProvider,
      { store: opts.cursorStore ?? createCursorStore() },
      createElement(
        TermContext.Provider,
        { value: opts.term },
        createElement(
          StdoutContext.Provider,
          { value: { stdout: opts.term.stdout, write: () => {} } },
          createElement(
            FocusManagerContext.Provider,
            { value: opts.focusManager ?? createFocusManager() },
            createElement(RuntimeContext.Provider, { value: runtimeValue }, el),
          ),
        ),
      ),
    )
}

// Ink compatibility layer (adds Ink-specific contexts)
function withInk(opts?: { cursorStore?: CursorStore }): Plugin {
  return (el) =>
    createElement(
      InkCursorStoreCtx.Provider,
      { value: opts?.cursorStore ?? createCursorStore() },
      createElement(InkFocusProvider, null, createElement(InkErrorBoundary, null, el)),
    )
}

// Theme provider
function withTheme(palette: ColorPalette): Plugin {
  return (el) => createElement(ThemeProvider, { palette }, el)
}
```

### Composition

Plugins compose via simple function chaining:

```typescript
function composePlugins(...plugins: Plugin[]): Plugin {
  return (el) => plugins.reduceRight((acc, plugin) => plugin(acc), el)
}
```

### Usage

```typescript
// Pure silvery app
await run(<App />, {
  plugins: [withTheme(catppuccinMocha)],
})

// Ink compat app
const app = render(<InkApp />, {
  plugins: [withInk()],
})

// xterm.js showcase with focus + theme
const instance = renderToXterm(<Showcase />, term, {
  plugins: [withTheme(nord)],
})

// Custom plugin
function withAnalytics(): Plugin {
  return (el) => createElement(AnalyticsProvider, null, el)
}

await run(<App />, {
  plugins: [withTheme(dracula), withAnalytics()],
})
```

### Implementation Plan

1. **Phase 1: Add `plugins` option to all entry points**
   - Add `plugins?: Plugin[]` to `RunOptions`, `RenderOptions`, `XtermRenderOptions`
   - Apply plugins in `wrapWithContexts()` / equivalent, after silvery's core providers
   - Deprecate `wrapRoot` in favor of `plugins`

2. **Phase 2: Extract withInk() from ink.ts**
   - Move the `withInk` function from ink.ts into `@silvery/compat`
   - Have ink.ts `render()` pass `plugins: [withInk()]` to the test renderer
   - Removes ~300 lines of reimplemented render pipeline from ink.ts

3. **Phase 3: Add withTheme() to showcases**
   - Apply `withTheme()` to all web showcases
   - Enables theme switching in the showcase viewer

### Design Principles

- **Plugins are just React providers** — no custom API, no registration
- **Composition order = nesting order** — first plugin = outermost wrapper
- **Core providers always present** — plugins add on top of silvery's base stack
- **Backwards compatible** — `wrapRoot` still works (converted to a single plugin internally)

### Migration Path

```typescript
// Before (wrapRoot):
render(<App />, { wrapRoot: (el) => <MyProvider>{el}</MyProvider> })

// After (plugins):
render(<App />, { plugins: [(el) => <MyProvider>{el}</MyProvider>] })
```

The `wrapRoot` option continues to work — internally it's treated as `plugins: [wrapRoot]`.

## Alternatives Considered

### 1. Provider Registry Pattern

Register providers globally: `silvery.use(InkPlugin)`. Rejected because:

- Global state causes cross-test contamination
- Order-dependent registration is error-prone
- Can't have different provider stacks for different render instances

### 2. Middleware Pattern (Redux-style)

Each plugin wraps the render function itself. Rejected because:

- Over-engineered for wrapping React context providers
- The problem is just "add providers to the tree", not "intercept render pipeline"

### 3. Config Object Pattern

Pass a config describing desired features: `{ focus: true, cursor: true, theme: 'nord' }`. Rejected because:

- Limited to pre-defined options
- Can't support arbitrary third-party providers
- Requires silvery to know about all possible plugins at compile time
