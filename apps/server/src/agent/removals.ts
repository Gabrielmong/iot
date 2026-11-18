import type { PrismaClient } from "../generated/prisma/client.js";

/** How long a removed PC's agent is still told to uninstall when it connects. */
export const REMOVAL_KEEP_MS = 90 * 86_400_000;

/** Remembers a removed PC's agent token so the agent uninstalls itself when it next connects. */
export async function recordRemoval(prisma: PrismaClient, tokenHash: string, now: Date): Promise<void> {
  await prisma.agentRemoval.upsert({ where: { tokenHash }, create: { tokenHash, createdAt: now }, update: { createdAt: now } });
}

/** True when this token's PC was removed less than 90 days ago; an older record is deleted. */
export async function pendingRemoval(prisma: PrismaClient, tokenHash: string, now: Date): Promise<boolean> {
  const row = await prisma.agentRemoval.findUnique({ where: { tokenHash } });
  if (!row) return false;
  if (now.getTime() - row.createdAt.getTime() <= REMOVAL_KEEP_MS) return true;
  await prisma.agentRemoval.deleteMany({ where: { tokenHash } });
  return false;
}

export async function clearRemoval(prisma: PrismaClient, tokenHash: string): Promise<void> {
  await prisma.agentRemoval.deleteMany({ where: { tokenHash } });
}
