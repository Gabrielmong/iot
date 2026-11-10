import type { PrismaClient } from "../generated/prisma/client.js";

/** `Setting` keys for when each integration last synced successfully. Plain ISO strings: not secrets. */
export const SyncTimeKey = {
  tuya: "tuya.lastSyncAt",
  kasa: "kasa.lastSavedAt",
  swann: "swann.lastSyncAt",
} as const;

export type SyncTimes = { tuyaLastSyncAt: string | null; kasaLastSavedAt: string | null; swannLastSyncAt: string | null };

/** Records that an integration just synced (or its sign-in was accepted). */
export async function markSynced(prisma: PrismaClient, key: (typeof SyncTimeKey)[keyof typeof SyncTimeKey], now: Date): Promise<void> {
  const value = now.toISOString();
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function readSyncTimes(prisma: PrismaClient): Promise<SyncTimes> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(SyncTimeKey) } } });
  const at = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
  return { tuyaLastSyncAt: at(SyncTimeKey.tuya), kasaLastSavedAt: at(SyncTimeKey.kasa), swannLastSyncAt: at(SyncTimeKey.swann) };
}
