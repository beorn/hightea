import "vitest"

interface SilveryRetryOptions {
  timeout?: number
}

declare module "vitest" {
  interface Assertion<T = unknown> {
    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
  }

  interface Matchers<T = unknown> {
    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
  }
}
