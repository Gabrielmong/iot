import type { PrismaClient, User } from "../generated/prisma/client.js";
import { unknownUserError } from "./login.js";
import { createSession } from "./sessions.js";

/**
 * Signs in a PIN-less guest. Anyone else (users, admins, guests with a PIN, unknown ids) gets
 * the same error as an unknown id on login. It never touches the lockout counter.
 *
 * The user row is locked while eligibility is checked and the session is inserted, so a
 * concurrent updateUser (role or PIN change, which then deletes sessions) cannot slip between them.
 */
export async function loginGuest(
  prisma: PrismaClient,
  userId: string,
  shared: boolean,
  now: Date = new Date(),
): Promise<{ token: string; user: User }> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "GUEST" || user.pinHash !== null) return null;
    return { token: await createSession(tx, userId, shared, now), user };
  });
  if (!result) throw await unknownUserError("00000000");
  return result;
}
