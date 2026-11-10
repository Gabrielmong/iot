import type { Prisma } from "./generated/prisma/client.js";

/** A JSON column as a plain object ({} for null, arrays and scalars). */
export function asObject(json: Prisma.JsonValue | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json) ? json : {};
}
