import { hashPin } from "./auth/pin.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export const BOOTSTRAP_ADMIN_NAME = "Admin";
const BOOTSTRAP_ADMIN_COLOR = "#1976d2";

/**
 * On an empty database, creates the `Admin` user with the PIN from BOOTSTRAP_ADMIN_PIN (required
 * then) so the house can be set up. Does nothing once any user exists. Never logs the PIN.
 */
export async function ensureBootstrapAdmin(prisma: PrismaClient, pin: string | undefined, log: Pick<Console, "info">): Promise<boolean> {
  if ((await prisma.user.count()) > 0) return false;
  if (!pin) throw new Error("BOOTSTRAP_ADMIN_PIN is required when there are no users");
  await prisma.user.create({ data: { name: BOOTSTRAP_ADMIN_NAME, role: "ADMIN", avatarColor: BOOTSTRAP_ADMIN_COLOR, pinHash: await hashPin(pin) } });
  log.info(`No users found: created the "${BOOTSTRAP_ADMIN_NAME}" admin with the PIN from BOOTSTRAP_ADMIN_PIN`);
  return true;
}
