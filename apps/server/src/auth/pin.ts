import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PIN_PATTERN = /^\d{4,8}$/;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const FORMAT = "scrypt";

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

function derive(pin: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_LENGTH, params, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (salt and hash base64) so params travel with the hash. */
export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error("PIN must be 4 to 8 digits");
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(pin, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return [FORMAT, N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

/** Constant-time comparison; false for any malformed stored hash. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== FORMAT) return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(pin, salt, { N, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
