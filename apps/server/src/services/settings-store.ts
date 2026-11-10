import type { PrismaClient } from "../generated/prisma/client.js";
import { decryptSecret, encryptSecret } from "../secrets.js";

/** Stores each value encrypted under its key, all or nothing. */
export async function writeEncryptedSettings(prisma: PrismaClient, secretKey: Buffer, values: Record<string, string>): Promise<void> {
  await prisma.$transaction(
    Object.entries(values).map(([key, plain]) => {
      const value = encryptSecret(plain, secretKey);
      return prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }),
  );
}

/** The decrypted values, or undefined when any key is missing or cannot be decrypted. */
export async function readEncryptedSettings<K extends string>(
  prisma: PrismaClient,
  secretKey: Buffer,
  keys: readonly K[],
): Promise<Record<K, string> | undefined> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...keys] } } });
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    if (!row) return undefined;
    try {
      out[key] = decryptSecret(row.value, secretKey);
    } catch {
      return undefined; // e.g. SECRET_KEY changed: treated as not configured
    }
  }
  return out;
}

/** Whether every key has a stored value (without decrypting). */
export async function hasSettings(prisma: PrismaClient, keys: readonly string[]): Promise<boolean> {
  return (await prisma.setting.count({ where: { key: { in: [...keys] } } })) === keys.length;
}
