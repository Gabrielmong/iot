import type { RtspCredentials } from "@home/protocols";
import type { PrismaClient } from "../generated/prisma/client.js";
import { readEncryptedSettings } from "../services/settings-store.js";
import { SettingKey } from "../settings-keys.js";

/** Reads a camera's stored ONVIF login (encrypted); undefined when missing, undecryptable or malformed. Never logged. */
export function onvifCredentialsFrom(prisma: PrismaClient, secretKey: Buffer): (deviceId: string) => Promise<RtspCredentials | undefined> {
  return async (deviceId) => {
    const key = SettingKey.cameraOnvif(deviceId);
    const stored = await readEncryptedSettings(prisma, secretKey, [key]);
    return stored && parseCredentials(stored[key]);
  };
}

/** The JSON a login is stored as. */
export const serializeCredentials = (creds: RtspCredentials): string => JSON.stringify({ username: creds.username, password: creds.password });

function parseCredentials(json: string): RtspCredentials | undefined {
  try {
    const v = JSON.parse(json) as { username?: unknown; password?: unknown };
    return typeof v.username === "string" && typeof v.password === "string" ? { username: v.username, password: v.password } : undefined;
  } catch {
    return undefined;
  }
}
