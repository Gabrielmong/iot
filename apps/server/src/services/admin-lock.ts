import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { badInput } from "../api-errors.js";

/** Advisory lock id that serializes every change which could remove an admin. */
const ADMIN_LOCK_ID = 7_310_001;

/** Runs `fn` in a transaction holding the admin lock, so two concurrent demotions cannot both pass. */
export function withAdminLock<T>(prisma: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_ID})`;
    return fn(tx);
  });
}

/** Throws BAD_USER_INPUT when `userId` is the only ADMIN. Call inside withAdminLock. */
export async function assertNotLastAdmin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const others = await tx.user.count({ where: { role: "ADMIN", id: { not: userId } } });
  if (others === 0) throw badInput("The house needs at least one admin");
}
