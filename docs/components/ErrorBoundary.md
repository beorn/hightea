# ErrorBoundary

Catches JavaScript errors in child component tree and displays a fallback UI. Follows React's error boundary pattern using class component lifecycle methods.

## Import

```tsx
import { ErrorBoundary } from "silvery"
```

## Props

| Prop        | Type                                                               | Default           | Description                                               |
| ----------- | ------------------------------------------------------------------ | ----------------- | --------------------------------------------------------- |
| `children`  | `ReactNode`                                                        | **required**      | Child components to render                                |
| `fallback`  | `ReactNode \| ((error: Error, errorInfo: ErrorInfo) => ReactNode)` | default error box | Fallback UI when error is caught                          |
| `onError`   | `(error: Error, errorInfo: ErrorInfo) => void`                     | --                | Called when an error is caught (for logging)              |
| `onReset`   | `() => void`                                                       | --                | Called when the error is reset                            |
| `resetKey`  | `string \| number`                                                 | --                | When this changes, error boundary resets                  |
| `resetKeys` | `unknown[]`                                                        | --                | When any element changes (shallow), error boundary resets |

## Usage

```tsx
// Basic usage with default fallback
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// Custom fallback
<ErrorBoundary fallback={<Text color="red">Something went wrong</Text>}>
  <MyComponent />
</ErrorBoundary>

// Function fallback with error details
<ErrorBoundary
  fallback={(error, errorInfo) => (
    <Box flexDirection="column">
      <Text color="red">Error: {error.message}</Text>
      <Text dim>{errorInfo.componentStack}</Text>
    </Box>
  )}
>
  <MyComponent />
</ErrorBoundary>

// With reset functionality
const [resetKey, setResetKey] = useState(0)
<ErrorBoundary
  resetKey={resetKey}
  onReset={() => console.log('Retrying...')}
>
  <MyComponent />
</ErrorBoundary>
// On retry: setResetKey(k => k + 1)
```

## Default Fallback

When no `fallback` prop is provided, renders a red bordered box with the error message and truncated component stack.

## See Also

- [Box](./Box.md) -- layout container
