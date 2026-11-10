import type { PrismaClient } from "../generated/prisma/client.js";
import { decryptSecret } from "../secrets.js";
import { SettingKey } from "../settings-keys.js";

export type KasaCredentials = { username: string; password: string };

/** Reads the TP-Link account from encrypted settings; undefined until both are stored and decryptable. */
export function kasaCredentialsFrom(prisma: PrismaClient, secretKey: Buffer): () => Promise<KasaCredentials | undefined> {
  return async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: [SettingKey.kasaUsername, SettingKey.kasaPassword] } } });
    const value = (key: string) => rows.find((r) => r.key === key)?.value;
    const username = value(SettingKey.kasaUsername);
    const password = value(SettingKey.kasaPassword);
    if (!username || !password) return undefined;
    try {
      return { username: decryptSecret(username, secretKey), password: decryptSecret(password, secretKey) };
    } catch {
      return undefined; // e.g. SECRET_KEY changed: the drivers report NEEDS_CREDENTIALS
    }
  };
}
