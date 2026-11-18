import { createHash, randomBytes } from "node:crypto";

/** A random secret, base64url: 16 bytes for enrollment codes, 32 for agent tokens. */
export function newSecret(bytes: 16 | 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
