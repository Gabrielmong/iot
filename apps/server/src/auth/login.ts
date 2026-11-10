import type { PrismaClient, User } from "../generated/prisma/client.js";
import { invalidPinError, lockedError } from "./errors.js";
import { attemptsLeft, clearFailedAttempts, lockSecondsRemaining, reserveAttempt } from "./lockout.js";
import { hashPin, verifyPin } from "./pin.js";
import { createSession } from "./sessions.js";

let decoyHash: Promise<string> | undefined;

/** Burns the same scrypt time as a real check so unknown ids look like a user's first miss. */
export async function unknownUserError(pin: string) {
  decoyHash ??= hashPin("00000000");
  await verifyPin(pin, await decoyHash);
  return invalidPinError(attemptsLeft(1));
}

/** Locked response, or the unknown-user response when the account no longer exists. */
async function lockedOrUnknown(prisma: PrismaClient, userId: string, pin: string, now: Date) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return unknownUserError(pin);
  return lockedError(Math.max(1, lockSecondsRemaining(user, now)));
}

/**
 * The attempt is reserved atomically before the PIN is checked, so at most 5 guesses run per
 * window however many requests arrive at once. A locked account answers LOCKED immediately,
 * whether the PIN is right or wrong.
 */
export async function login(
  prisma: PrismaClient,
  userId: string,
  pin: string,
  shared: boolean,
  now: Date = new Date(),
): Promise<{ token: string; user: User }> {
  const reservation = await reserveAttempt(prisma, userId, now);
  if (!reservation) throw await lockedOrUnknown(prisma, userId, pin, now);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw await unknownUserError(pin);

  // A PIN-less guest never verifies; the decoy keeps the timing and lockout identical to a wrong PIN.
  decoyHash ??= hashPin("00000000");
  if (!(await verifyPin(pin, user.pinHash ?? (await decoyHash))) || user.pinHash === null) {
    throw invalidPinError(attemptsLeft(reservation.failedPinCount));
  }

  const cleared = await clearFailedAttempts(prisma, userId, now, reservation.lockedUntil);
  if (!cleared) throw await lockedOrUnknown(prisma, userId, pin, now);

  const token = await createSession(prisma, userId, shared, now);
  const fresh = await prisma.user.findUnique({ where: { id: userId } });
  if (!fresh) throw await unknownUserError(pin);
  return { token, user: fresh };
}
