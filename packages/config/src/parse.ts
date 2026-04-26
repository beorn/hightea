import type { ZodSchema, z } from "zod"
import type { CoerceType, Kind } from "./types.ts"

/**
 * Parse a connection string into a typed object using a kind's schema + coerce hints.
 *
 * Grammar:
 *   [<scheme>://]<path>[?<key>=<value>&<key>=<value>...]
 *
 * - Scheme is optional and stored as `transport` if present.
 * - Path is sugar for the kind's `pathField`. `claude-code?...` ≡ `?agent=claude-code&...` when pathField is "agent".
 * - Bare keys without `=` are `true`. `!key` is `false`.
 * - Type coercion is per-key via the kind's `coerce` map; default is "string".
 * - Comma-arrays: `tools=read,edit` → `["read","edit"]` when coerce hints "array".
 * - Bracket-arrays: `tools[]=read&tools[]=edit` → `["read","edit"]` (always honored, regardless of hint).
 * - Dot-paths in keys: `mcp.km.cwd=/path` → `{ mcp: { km: { cwd: "/path" } } }`.
 */
export function parseString<S extends ZodSchema>(input: string, kind: Kind<S>): z.infer<S> {
  const trimmed = input.trim()
  if (trimmed === "") throw new Error(`${kind.name}: empty connection string`)

  const { scheme, path, query } = splitParts(trimmed)
  const out: Record<string, unknown> = {}

  if (scheme) out.transport = scheme
  if (path && kind.pathField) {
    out[kind.pathField] = path
  } else if (path && !kind.pathField) {
    throw new Error(
      `${kind.name}: path segment "${path}" but kind has no pathField. Move it to a query param.`,
    )
  }

  for (const [rawKey, rawValue] of parseQueryPairs(query)) {
    let key = rawKey
    let coerced: unknown
    if (rawValue === undefined) {
      // bare key — true, or false if "!" prefix
      if (key.startsWith("!")) {
        key = key.slice(1)
        coerced = false
      } else {
        coerced = true
      }
    } else {
      coerced = coerceValue(key, rawValue, kind.coerce[key])
    }
    setDeep(out, key, coerced, /* allowArrayMerge= */ key.endsWith("[]"))
  }

  // Strip "[]" suffixes after array assembly.
  stripBracketArrayKeys(out)

  return kind.schema.parse(out) as z.infer<S>
}

/**
 * Format a typed object as a connection string. Lossy if the object has fields
 * the kind's schema doesn't recognize. Round-trip is lossless for fields that
 * pass through `parseString` cleanly.
 */
export function formatString<S extends ZodSchema>(value: z.infer<S>, kind: Kind<S>): string {
  const obj = value as Record<string, unknown>
  const parts: string[] = []
  let scheme: string | undefined
  let path: string | undefined

  if (typeof obj.transport === "string") scheme = obj.transport
  if (kind.pathField && typeof obj[kind.pathField] === "string") {
    path = obj[kind.pathField] as string
  }

  for (const [key, raw] of Object.entries(obj)) {
    if (key === "transport") continue
    if (key === kind.pathField) continue
    if (raw === undefined || raw === null) continue
    appendQueryFor(parts, key, raw)
  }

  let out = ""
  if (scheme) out += `${scheme}://`
  if (path) out += path
  if (parts.length) out += `?${parts.join("&")}`
  return out
}

// ---------------------------------------------------------------------------
// Internals

function splitParts(input: string): { scheme?: string; path?: string; query?: string } {
  let rest = input
  let scheme: string | undefined

  // Match scheme://... — limited to letters/digits/+/-/.
  const schemeMatch = /^([a-z][a-z0-9+\-.]*):\/\//i.exec(rest)
  if (schemeMatch) {
    scheme = schemeMatch[1]
    rest = rest.slice(schemeMatch[0].length)
  }

  const qIdx = rest.indexOf("?")
  if (qIdx === -1) {
    return { scheme, path: rest === "" ? undefined : rest, query: undefined }
  }
  return {
    scheme,
    path: qIdx === 0 ? undefined : rest.slice(0, qIdx),
    query: rest.slice(qIdx + 1),
  }
}

function* parseQueryPairs(query: string | undefined): IterableIterator<[string, string | undefined]> {
  if (!query) return
  for (const pair of query.split("&")) {
    if (pair === "") continue
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) {
      yield [decodePart(pair), undefined]
    } else {
      yield [decodePart(pair.slice(0, eqIdx)), decodePart(pair.slice(eqIdx + 1))]
    }
  }
}

function decodePart(s: string): string {
  // Decode percent-encoding only. Plus-as-space is HTML-form convention; we don't apply it
  // because connection strings aren't form-encoded — `model=opus+4` should preserve the `+`.
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function coerceValue(key: string, raw: string, hint: CoerceType | undefined): unknown {
  const t = hint ?? inferType(raw)
  switch (t) {
    case "boolean":
      return raw === "1" || raw === "true"
    case "number": {
      const n = Number(raw)
      if (Number.isNaN(n)) throw new Error(`coerce: ${key}=${raw} is not a number`)
      return n
    }
    case "array":
      return raw === "" ? [] : raw.split(",").map((s) => s.trim())
    case "string":
      return raw
  }
}

function inferType(raw: string): CoerceType {
  // Conservative inference for unknown keys — strings by default. Numeric-looking
  // strings stay strings unless declared (e.g. `model=4` is the model id "4", not number 4).
  return "string"
}

function setDeep(obj: Record<string, unknown>, key: string, value: unknown, allowArrayMerge: boolean): void {
  // Strip "[]" for path traversal but mark as array-merge.
  let bareKey = key
  if (bareKey.endsWith("[]")) {
    bareKey = bareKey.slice(0, -2)
    allowArrayMerge = true
  }

  const parts = bareKey.split(".")
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i] as string
    if (!(p in cur) || typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) {
      cur[p] = {}
    }
    cur = cur[p] as Record<string, unknown>
  }
  const last = parts[parts.length - 1] as string
  if (allowArrayMerge) {
    const existing = cur[last]
    if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      cur[last] = [value]
    }
  } else {
    cur[last] = value
  }
}

function stripBracketArrayKeys(obj: Record<string, unknown>): void {
  // setDeep already strips "[]" before traversal, so values land at the bare key.
  // This pass exists to handle the case where the user wrote both `tools[]=x` and `tools=y`
  // — we currently let last-write-win at the leaf (no merging across forms). If/when that
  // becomes a real-world need, refactor here.
  void obj
}

function appendQueryFor(parts: string[], key: string, raw: unknown): void {
  if (Array.isArray(raw)) {
    // Use comma form for primitives, bracket form for objects (rare).
    if (raw.every((v) => typeof v !== "object" || v === null)) {
      parts.push(`${encodeKey(key)}=${raw.map((v) => encodePart(String(v))).join(",")}`)
    } else {
      for (const v of raw) parts.push(`${encodeKey(`${key}[]`)}=${encodePart(JSON.stringify(v))}`)
    }
    return
  }
  if (typeof raw === "boolean") {
    if (raw) parts.push(encodeKey(key))
    else parts.push(`!${encodeKey(key)}`)
    return
  }
  if (typeof raw === "object" && raw !== null) {
    // Flatten one level via dot-paths. Deeper nesting → caller should use object form in YAML.
    for (const [k2, v2] of Object.entries(raw)) {
      appendQueryFor(parts, `${key}.${k2}`, v2)
    }
    return
  }
  parts.push(`${encodeKey(key)}=${encodePart(String(raw))}`)
}

function encodeKey(k: string): string {
  return encodeURIComponent(k).replace(/%2E/g, ".") // preserve dots in nested keys
}

function encodePart(s: string): string {
  // Encode the minimum needed to survive `?key=value&key=value` parsing.
  // Keep `@`, `:`, `/` literal — they're allowed in query values per RFC 3986 §3.4.
  return s.replace(/[&=#?+]/g, (c) => encodeURIComponent(c))
}
