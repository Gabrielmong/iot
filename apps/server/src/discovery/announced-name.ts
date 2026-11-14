import type { PrismaClient } from "../generated/prisma/client.js";
import { DEFAULT_HOME_NAME, getHomeName } from "../services/home-name.js";

/** The home name to announce; a failed lookup falls back to the default so startup carries on. */
export async function announcedName(prisma: PrismaClient, log: { warn(msg: string): void }): Promise<string> {
  try {
    return await getHomeName(prisma);
  } catch (err) {
    log.warn(`Couldn't read the home name for mDNS, using "${DEFAULT_HOME_NAME}": ${err instanceof Error ? err.message : String(err)}`);
    return DEFAULT_HOME_NAME;
  }
}
