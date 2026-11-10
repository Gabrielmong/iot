import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM. Output: base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(blob: string, key: Buffer): string {
  const raw = Buffer.from(blob, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Invalid secret blob");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
