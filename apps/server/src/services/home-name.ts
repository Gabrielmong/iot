import type { PrismaClient } from "../generated/prisma/client.js";
import { SettingKey } from "../settings-keys.js";
import { parseName } from "./user-input.js";

export const DEFAULT_HOME_NAME = "Home";

/** The household's display name, or "Home" until an admin sets one. */
export async function getHomeName(prisma: PrismaClient): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: SettingKey.homeName } });
  return row?.value ?? DEFAULT_HOME_NAME;
}

/** Stores the trimmed name (1-40 characters) and returns it. */
export async function setHomeName(prisma: PrismaClient, name: string): Promise<string> {
  const value = parseName(name, "Home name");
  const key = SettingKey.homeName;
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return value;
}
