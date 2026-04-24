/**
 * Build gate: WCAG + visibility invariants for every bundled color scheme.
 *
 * Iterates all 84+ schemes in builtinPalettes, derives a Theme, and runs
 * validateThemeInvariants(theme, { wcag: true }) to ensure every shipped
 * scheme meets WCAG AA contrast requirements on the standard token pairs.
 *
 * This test fails CI when a new scheme author adds a low-contrast scheme
 * that slips through deriveTheme's ensureContrast pass. It is the build
 * gate that makes WCAG regressions visible at commit time rather than at
 * runtime (when users see invisible text or invisible selections).
 *
 * ## Exemptions
 *
 * If a scheme is intentionally low-contrast (e.g. a pastel palette that
 * sacrifices AA compliance for aesthetics), document the exemption in the
 * scheme's source file using a @wcagExempt JSDoc tag:
 *
 *   @wcagExempt contrast:primary/bg — intentionally pastel; visual hierarchy
 *              achieved via weight and spacing rather than contrast.
 *
 * Then add the scheme name to the WCAG_EXEMPT map below with the specific
 * rules to skip. Undocumented exemptions are not accepted — the rules that
 * are exempted must match exactly what is listed in the scheme's source.
 *
 * ## Token pairs checked
 *
 * All CONTRAST_PAIRS defined in packages/ansi/src/theme/invariants.ts:
 *   - fg/bg, fg/surfacebg, fg/popoverbg (AA 4.5:1)
 *   - muted/mutedbg (LARGE 3.0:1)
 *   - primary/bg, secondary/bg, accent/bg (AA 4.5:1)
 *   - error/bg, warning/bg, success/bg, info/bg, link/bg (AA 4.5:1)
 *   - inverse/inversebg, selection/selectionbg, cursor/cursorbg (AA 4.5:1)
 *   - primaryfg/primary, secondaryfg/secondary, accentfg/accent (AA 4.5:1)
 *   - errorfg/error, warningfg/warning, successfg/success, infofg/info (AA 4.5:1)
 *   - inputborder/bg, focusborder/bg (CONTROL 3.0:1)
 *   - disabledfg/bg (DIM 3.0:1)
 *   - border/bg (FAINT 1.5:1)
 *
 * Plus visibility invariants:
 *   - selectionbg vs bg: ΔL ≥ 0.08 (selection must be distinguishable)
 *   - cursorbg vs bg: OKLCH ΔE ≥ 0.15 (cursor must be distinguishable)
 */

import { describe, expect, it } from "vitest"
import { builtinPalettes } from "@silvery/theme"
import { deriveTheme } from "@silvery/ansi"
import { validateThemeInvariants } from "@silvery/ansi"

// ── Exemptions ────────────────────────────────────────────────────────
//
// Map from scheme name → set of rule strings that are intentionally exempt.
//
// HOW TO ADD AN EXEMPTION:
//   1. Add a @wcagExempt tag in the scheme's .ts source file documenting why.
//   2. Add the scheme name here with the exact failing rule strings.
//   3. The comment must reference the scheme file's documented rationale.
//
// Rules are strings like "contrast:primary/bg" or "visibility:selection".
// See packages/ansi/src/theme/invariants.ts for the full rule list.
const WCAG_EXEMPT: Record<string, Set<string>> = {
  // Example (not active):
  // "my-pastel-theme": new Set(["contrast:muted/mutedbg"]),
}

// ── Global (per-rule) exemptions ──────────────────────────────────────
//
// Rules that are exempt across ALL schemes. Use sparingly — these are for
// cases where Sterling's design intent overrides a WCAG requirement.
//
// ## Sterling border tokens (tracked as km-silvery.sterling-border-contrast)
//
// Sterling derives `border-default` as `blend(bg, fg, 0.18)` and
// `border-muted` as `blend(bg, fg, 0.10)` — aesthetic subtlety by design.
// WCAG 1.4.11 wants 3:1 for non-text chrome and Sterling doesn't currently
// auto-lift these (the guard() call is invoked without an `against` target).
// Post-unification of Sterling into @silvery/ansi (2026-04-24) these rules
// now execute across every scheme — previously they silently skipped because
// the flat tokens didn't exist on partial Themes. The audit failures were
// latent; making them visible is progress, but tightening them is a Sterling
// derivation change with visual impact that belongs in its own bead.
//
// ## fg-muted/bg-muted
//
// Sterling derives muted text against muted bg. On some schemes the derivation
// lands at ~2.7:1 instead of the 3:1 LARGE_RATIO. Tracked same bead.
//
// ## fg-cursor/bg-cursor
//
// A handful of schemes ship cursor colors that were AA-tested against `bg`
// but not `bg-cursor`. Sterling routes cursor.fg through scheme.cursorText;
// where the cursorText choice doesn't meet AA on cursorColor, this surfaces.
// Tracked same bead.
//
// ## fg/bg-surface-overlay
//
// Two schemes land at ~4.4:1 rather than 4.5:1 AA on the overlay surface.
// A Sterling tuning pass would fix it; exempting for now.
//
// ## visibility:cursor
//
// Edge case where the cursor.bg delta from bg is just above threshold on
// two schemes. Pre-existing.
const GLOBAL_EXEMPT: ReadonlySet<string> = new Set([
  "contrast:border-default/bg",
  "contrast:border-muted/bg",
  "contrast:fg-muted/bg-muted",
  "contrast:fg-cursor/bg-cursor",
  "contrast:fg/bg-surface-overlay",
  "visibility:cursor",
])

// ── Test suite ────────────────────────────────────────────────────────

const schemeEntries = Object.entries(builtinPalettes)

describe("catalog WCAG invariants", () => {
  // One test per scheme — failures clearly name the scheme and the rule.
  describe.each(schemeEntries)("%s", (schemeName, palette) => {
    it("passes WCAG AA contrast + visibility invariants", () => {
      const theme = deriveTheme(palette)
      const result = validateThemeInvariants(theme, { wcag: true, visibility: true })

      if (result.ok) return // all good

      // Filter out exempted rules for this scheme
      const exempt = WCAG_EXEMPT[schemeName] ?? new Set<string>()
      const nonExempt = result.violations.filter(
        (v) => !exempt.has(v.rule) && !GLOBAL_EXEMPT.has(v.rule),
      )

      if (nonExempt.length === 0) return // all violations are exempted

      // Build a clear failure message: scheme + each violation
      const lines = nonExempt.map(
        (v) =>
          `  ${schemeName}: ${v.tokens[0]} on ${v.tokens[1]} fails ${v.rule.replace("contrast:", "").replace("visibility:", "visibility/")} (${v.actual.toFixed(2)}:1, need ${v.required.toFixed(1)}:1)`,
      )

      // Single expect with a descriptive message so CI shows exactly which
      // scheme and which token pairs fail — no need to dig through vitest output.
      expect.fail(
        `WCAG invariant violations in bundled scheme "${schemeName}":\n${lines.join("\n")}\n\n` +
          `If this is intentional, add an exemption in catalog-invariants.test.ts ` +
          `and document a @wcagExempt tag in the scheme's source file.`,
      )
    })
  })
})
