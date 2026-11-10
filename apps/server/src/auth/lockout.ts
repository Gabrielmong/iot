import type { Prisma, PrismaClient, User } from "../generated/prisma/client.js";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 60_000;

/** Seconds left on the lock at `now`, or 0 when not locked. */
export function lockSecondsRemaining(user: Pick<User, "lockedUntil">, now: Date): number {
  if (!user.lockedUntil || user.lockedUntil <= now) return 0;
  return Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
}

/** Binds a Date as a UTC timestamp, independent of the session or server timezone. */
const utc = (d: Date) => d.toISOString();

/**
 * Reserves one PIN attempt atomically, BEFORE the PIN is checked. A single UPDATE both counts
 * the attempt and sets the lock when it is the 5th, and matches no row while the user is locked
 * (so concurrent requests cannot exceed 5 guesses per window). An expired lock restarts the
 * count from zero. Returns null when locked or when the user does not exist.
 */
export async function reserveAttempt(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<{ failedPinCount: number; lockedUntil: Date | null } | null> {
  const lockUntil = new Date(now.getTime() + LOCK_MS);
  const rows = await prisma.$queryRaw<{ failedPinCount: number }[]>`
    UPDATE "User" SET
      "failedPinCount" = CASE WHEN "lockedUntil" IS NOT NULL THEN 0 ELSE "failedPinCount" END + 1,
      "lockedUntil" = CASE
        WHEN (CASE WHEN "lockedUntil" IS NOT NULL THEN 0 ELSE "failedPinCount" END) + 1 >= ${MAX_FAILED_ATTEMPTS}
        THEN (${utc(lockUntil)}::timestamptz AT TIME ZONE 'UTC')
        ELSE NULL END
    WHERE id = ${userId}
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= (${utc(now)}::timestamptz AT TIME ZONE 'UTC'))
    RETURNING "failedPinCount"`;
  if (rows.length === 0) return null;
  const failedPinCount = Number(rows[0].failedPinCount);
  return { failedPinCount, lockedUntil: failedPinCount >= MAX_FAILED_ATTEMPTS ? lockUntil : null };
}

/**
 * Clears the counter after a correct PIN, unless a lock was set meanwhile by someone else.
 * `ownLock` is the lock this very attempt set (its 5th reservation was the correct PIN).
 * Returns false when the user is locked (or gone) and must not be logged in.
 */
export async function clearFailedAttempts(
  prisma: PrismaClient,
  userId: string,
  now: Date,
  ownLock: Date | null,
): Promise<boolean> {
  const unlocked: Prisma.UserWhereInput[] = [{ lockedUntil: null }, { lockedUntil: { lte: now } }];
  if (ownLock) unlocked.push({ lockedUntil: ownLock });
  const { count } = await prisma.user.updateMany({
    where: { id: userId, OR: unlocked },
    data: { failedPinCount: 0, lockedUntil: null },
  });
  return count > 0;
}

export function attemptsLeft(failedPinCount: number): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - failedPinCount);
}
