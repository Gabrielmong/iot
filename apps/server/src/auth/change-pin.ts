import { badInput, forbidden } from "../api-errors.js";
import type { User } from "../generated/prisma/client.js";
import type { ServiceDeps } from "../services/deps.js";
import { parsePin } from "../services/user-input.js";
import { unknownUserError } from "./login.js";
import { invalidPinError, lockedError } from "./errors.js";
import { attemptsLeft, clearFailedAttempts, lockSecondsRemaining, reserveAttempt } from "./lockout.js";
import { hashPin, verifyPin } from "./pin.js";
import { hashToken } from "./sessions.js";

type Deps = Pick<ServiceDeps, "prisma" | "sessionEvents" | "now">;

async function lockedOrUnknown(deps: Deps, userId: string, pin: string, now: Date) {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user) return unknownUserError(pin);
  return lockedError(Math.max(1, lockSecondsRemaining(user, now)));
}

/**
 * Changes the caller's own PIN. The current PIN is checked with the same reserved-attempt
 * lockout as sign-in; on success every other session of the user ends (and is announced).
 */
export async function changeMyPin(deps: Deps, user: User, currentToken: string, currentPin: string, newPin: string): Promise<void> {
  if (user.pinHash === null) throw forbidden("This profile has no PIN");
  parsePin(newPin);
  if (newPin === currentPin) throw badInput("New PIN must be different");

  const now = deps.now();
  const reservation = await reserveAttempt(deps.prisma, user.id, now);
  if (!reservation) throw await lockedOrUnknown(deps, user.id, currentPin, now);

  const fresh = await deps.prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) throw await unknownUserError(currentPin);
  if (fresh.pinHash === null || !(await verifyPin(currentPin, fresh.pinHash))) {
    throw invalidPinError(attemptsLeft(reservation.failedPinCount));
  }
  if (!(await clearFailedAttempts(deps.prisma, user.id, now, reservation.lockedUntil))) {
    throw await lockedOrUnknown(deps, user.id, currentPin, now);
  }

  const pinHash = await hashPin(newPin);
  const keep = hashToken(currentToken);
  const ended = await deps.prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { pinHash } });
    const others = await tx.session.findMany({ where: { userId: user.id, tokenHash: { not: keep } }, select: { tokenHash: true } });
    await tx.session.deleteMany({ where: { userId: user.id, tokenHash: { in: others.map((s) => s.tokenHash) } } });
    return others.map((s) => s.tokenHash);
  });
  for (const tokenHash of ended) deps.sessionEvents.emit("sessionEnded", tokenHash);
}
