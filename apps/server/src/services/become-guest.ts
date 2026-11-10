import type { Prisma } from "../generated/prisma/client.js";
import { GUEST_HIDDEN_KINDS } from "./guest-rules.js";

/**
 * Strips what guests may not have: camera grants, personal routines and camera groups, and audience
 * rows on shared camera groups. Call inside the transaction that changes the role. Returns the deleted
 * routine ids so the caller can stop any run in progress.
 */
export async function prepareGuest(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const routines = await tx.routine.findMany({ where: { ownerId: userId, scope: "PERSONAL" }, select: { id: true } });
  await tx.routine.deleteMany({ where: { ownerId: userId, scope: "PERSONAL" } });
  await tx.cameraGroup.deleteMany({ where: { ownerId: userId, scope: "PERSONAL" } });
  await tx.cameraGroupAudience.deleteMany({ where: { userId } });
  await tx.deviceGrant.deleteMany({ where: { userId, device: { kind: { in: [...GUEST_HIDDEN_KINDS] } } } });
  return routines.map((r) => r.id);
}
