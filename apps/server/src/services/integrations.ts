import { badInput, coded } from "../api-errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { SettingKey } from "../settings-keys.js";
import type { ServiceDeps, TuyaCloudCredentials, TuyaRegion } from "./deps.js";
import { hasSettings, readEncryptedSettings, writeEncryptedSettings } from "./settings-store.js";
import { markSynced, readSyncTimes, SyncTimeKey, type SyncTimes } from "./sync-times.js";

export type IntegrationStatus = { tuyaCloudConfigured: boolean; kasaConfigured: boolean; swannConfigured: boolean } & SyncTimes;

const TUYA_KEYS = [SettingKey.tuyaAccessId, SettingKey.tuyaAccessSecret, SettingKey.tuyaRegion] as const;
const KASA_KEYS = [SettingKey.kasaUsername, SettingKey.kasaPassword] as const;
const SWANN_KEYS = [SettingKey.swannHost, SettingKey.swannUsername, SettingKey.swannPassword] as const;
const TUYA_REGIONS: readonly TuyaRegion[] = ["us", "eu", "cn", "in"];

/** Whether each integration's credentials are stored (never the credentials themselves), and when each last synced. */
export async function integrationStatus(prisma: PrismaClient): Promise<IntegrationStatus> {
  const [tuyaCloudConfigured, kasaConfigured, swannConfigured, times] = await Promise.all([
    hasSettings(prisma, TUYA_KEYS),
    hasSettings(prisma, KASA_KEYS),
    hasSettings(prisma, SWANN_KEYS),
    readSyncTimes(prisma),
  ]);
  return { tuyaCloudConfigured, kasaConfigured, swannConfigured, ...times };
}

export async function setTuyaCloud(
  deps: Pick<ServiceDeps, "prisma" | "secretKey">,
  creds: { accessId: string; accessSecret: string; region: string },
): Promise<IntegrationStatus> {
  const region = creds.region.trim().toLowerCase();
  if (!isRegion(region)) throw badInput(`Region must be one of ${TUYA_REGIONS.join(", ")}`);
  await writeEncryptedSettings(deps.prisma, deps.secretKey, {
    [SettingKey.tuyaAccessId]: required(creds.accessId, "Access ID"),
    [SettingKey.tuyaAccessSecret]: required(creds.accessSecret, "Access Secret"),
    [SettingKey.tuyaRegion]: region,
  });
  return integrationStatus(deps.prisma);
}

/** The stored Tuya cloud credentials, decrypted; undefined until all three are stored. */
export async function tuyaCloudCredentials(deps: Pick<ServiceDeps, "prisma" | "secretKey">): Promise<TuyaCloudCredentials | undefined> {
  const s = await readEncryptedSettings(deps.prisma, deps.secretKey, TUYA_KEYS);
  const region = s?.[SettingKey.tuyaRegion];
  if (!s || !region || !isRegion(region)) return undefined;
  return { accessId: s[SettingKey.tuyaAccessId], accessSecret: s[SettingKey.tuyaAccessSecret], region };
}

/**
 * Stores the TP-Link account, re-syncs the drivers so Kasa links (re)connect with it, and runs Kasa
 * discovery at once. Throws KASA_AUTH_FAILED (the credentials stay stored) if a device rejects them.
 */
export async function setKasaCredentials(
  deps: Pick<ServiceDeps, "prisma" | "secretKey" | "manager" | "now">,
  username: string,
  password: string,
): Promise<IntegrationStatus> {
  await writeEncryptedSettings(deps.prisma, deps.secretKey, {
    [SettingKey.kasaUsername]: required(username, "Username"),
    [SettingKey.kasaPassword]: required(password, "Password"),
  });
  await deps.manager.refresh();
  const { authFailures } = await deps.manager.discoverNow("KASA");
  if (authFailures > 0) throw coded("KASA_AUTH_FAILED", `${authFailures} Kasa device(s) rejected the TP-Link credentials`);
  await markSynced(deps.prisma, SyncTimeKey.kasa, deps.now());
  return integrationStatus(deps.prisma);
}

function isRegion(value: string): value is TuyaRegion {
  return (TUYA_REGIONS as readonly string[]).includes(value);
}

function required(value: string, what: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw badInput(`${what} is required`);
  return trimmed;
}
