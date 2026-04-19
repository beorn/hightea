/**
 * Sterling — silvery's canonical DesignSystem.
 *
 * This is the default system shipped from `@silvery/theme`. It implements
 * the `DesignSystem` contract from `types.ts` and serves as the reference
 * for alternative systems (`@silvery/design-material`, `-primer`, etc.).
 *
 * All derivation functions return a frozen Theme with both nested roles
 * AND flat hyphen keys populated — the user-facing `$fg-accent` syntax
 * resolves against the flat keys, while programmatic access uses nested.
 */

import { blend } from "@silvery/color"
import type { ColorScheme } from "@silvery/ansi"
import type { DeepPartial, DeriveOptions, DesignSystem, Theme, ThemeShape } from "./types.ts"
import { deriveTheme, mergePartial } from "./derive.ts"
import { populateFlat, STERLING_FLAT_TOKENS } from "./flatten.ts"
import { defaultScheme } from "./defaults.ts"

const STERLING_SHAPE: ThemeShape = {
  flatTokens: STERLING_FLAT_TOKENS,
  roles: ["accent", "info", "success", "warning", "error", "muted", "surface", "border", "cursor"],
  states: ["hover", "active"],
}

/**
 * Internal: derive → flatten → freeze. Shared by every deriveFrom* entry.
 */
function buildTheme(scheme: ColorScheme, opts: DeriveOptions = {}): Theme {
  const nested = deriveTheme(scheme, opts)
  return populateFlat({ ...nested })
}

/**
 * Apply a brand overlay to a ColorScheme — overrides `primary` and relevant
 * ANSI hue slots with the brand color. Keeps the rest of the scheme intact.
 * Per Appendix F: brand is a theme INPUT, not a public token sibling of accent.
 */
function applyBrand(scheme: ColorScheme, brand: string): ColorScheme {
  return {
    ...scheme,
    primary: brand,
  }
}

export const sterling: DesignSystem = {
  name: "sterling",
  shape: STERLING_SHAPE,

  defaults(mode: "light" | "dark" = "dark"): Theme {
    return buildTheme(defaultScheme(mode), { contrast: "auto-lift" })
  },

  theme(partial?: DeepPartial<Theme>, opts: DeriveOptions = {}): Theme {
    const mode = opts.mode ?? "dark"
    const base = buildTheme(defaultScheme(mode), { ...opts, contrast: opts.contrast ?? "auto-lift" })
    if (!partial) return base
    // Merge partial over base, then re-flatten (nested keys may have changed).
    const merged = mergePartial(base, partial)
    // Re-flatten the merged result. mergePartial returns an unfrozen shallow
    // copy of the object in the shape of Theme; we need to rewrite flat keys
    // and re-freeze.
    const rebuilt: any = { ...merged }
    // Clear the old flat keys — they may be stale after patching the nested form.
    for (const k of STERLING_FLAT_TOKENS) delete rebuilt[k]
    return populateFlat(rebuilt)
  },

  deriveFromScheme(scheme: ColorScheme, opts: DeriveOptions = {}): Theme {
    return buildTheme(scheme, opts)
  },

  deriveFromColor(color: string, opts: DeriveOptions & { mode?: "light" | "dark" } = {}): Theme {
    const mode = opts.mode ?? "dark"
    const base = defaultScheme(mode)
    // Seed hue drives primary; keep background/foreground neutrals from the baseline.
    const scheme: ColorScheme = {
      ...base,
      name: `seed:${color}`,
      primary: color,
      blue: color,
      brightBlue: blend(color, "#ffffff", 0.15),
    }
    return buildTheme(scheme, opts)
  },

  deriveFromPair(light: ColorScheme, dark: ColorScheme, opts: DeriveOptions = {}): {
    light: Theme
    dark: Theme
  } {
    return {
      light: buildTheme(light, { ...opts, mode: "light" }),
      dark: buildTheme(dark, { ...opts, mode: "dark" }),
    }
  },

  deriveFromSchemeWithBrand(scheme: ColorScheme, brand: string, opts: DeriveOptions = {}): Theme {
    return buildTheme(applyBrand(scheme, brand), opts)
  },
}
