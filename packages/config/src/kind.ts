import type { ZodSchema } from "zod"
import type { Kind, KindOpts } from "./types.ts"

const DEFAULT_RESERVED = ["default"] as const

/**
 * Define a registry kind. The kind is the schema + parser hints for one
 * sub-tree of a config (e.g. "an ACP entry", "an MCP server definition").
 *
 * @example
 *   const AcpEntryKind = defineKind({
 *     name: "acp-entry",
 *     schema: z.object({ agent: z.string(), account: z.string().optional(), ... }),
 *     pathField: "agent",
 *     reservedKeys: ["default"],
 *     coerce: { bare: "boolean", temp: "number" },
 *   })
 */
export function defineKind<S extends ZodSchema>(opts: KindOpts<S>): Kind<S> {
  const reserved = new Set<string>(opts.reservedKeys ?? DEFAULT_RESERVED)
  return {
    name: opts.name,
    schema: opts.schema,
    pathField: opts.pathField,
    reservedKeys: reserved,
    coerce: opts.coerce ?? {},
  }
}
