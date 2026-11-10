import type { RtspCredentials, SwannProbeResult } from "@home/protocols";
import type { PrismaClient } from "../generated/prisma/client.js";
import { readEncryptedSettings } from "../services/settings-store.js";
import { SettingKey } from "../settings-keys.js";
import { parseSwannProbe } from "./drivers/swann-mapping.js";

/** The recorder's address and login. The password is never logged. */
export type SwannConnection = { host: string; creds: RtspCredentials };

/** The connection plus the stored probe result (absent until a probe found cameras). */
export type SwannSettings = SwannConnection & { probe?: SwannProbeResult };

const LOGIN_KEYS = [SettingKey.swannHost, SettingKey.swannUsername, SettingKey.swannPassword] as const;
const PROBE_KEYS = [SettingKey.swannProbe] as const;

/** Reads the recorder settings (encrypted); undefined until the host and login are stored and decryptable. */
export function swannSettingsFrom(prisma: PrismaClient, secretKey: Buffer): () => Promise<SwannSettings | undefined> {
  return async () => {
    const [login, probe] = await Promise.all([
      readEncryptedSettings(prisma, secretKey, LOGIN_KEYS),
      readEncryptedSettings(prisma, secretKey, PROBE_KEYS),
    ]);
    if (!login) return undefined;
    const settings: SwannSettings = {
      host: login[SettingKey.swannHost],
      creds: { username: login[SettingKey.swannUsername], password: login[SettingKey.swannPassword] },
    };
    const parsed = probe && parseSwannProbe(probe[SettingKey.swannProbe]);
    return parsed ? { ...settings, probe: parsed } : settings;
  };
}
