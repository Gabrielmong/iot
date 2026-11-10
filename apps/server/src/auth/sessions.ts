import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, Session, User } from "../generated/prisma/client.js";

export const PERSONAL_SESSION_MS = 90 * 24 * 60 * 60 * 1000;
export const SHARED_IDLE_MS = 3 * 60 * 1000;

/** Told (with the token hash) when a check finds a session expired and removes it; called at most once per session. */
export type ExpiryListener = (tokenHash: string) => void;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function ttlMs(shared: boolean): number {
  return shared ? SHARED_IDLE_MS : PERSONAL_SESSION_MS;
}

/** Creates a session and returns the raw token; only its SHA-256 is stored. */
export async function createSession(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  shared: boolean,
  now: Date,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      shared,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ttlMs(shared)),
    },
  });
  return token;
}

/** Validates a token, slides its expiry, and rejects (and removes) expired sessions. */
export async function resolveSession(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date(),
  onExpired?: ExpiryListener,
): Promise<{ user: User; session: Session } | null> {
  const tokenHash = hashToken(token);
  const found = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!found) return null;
  if (found.expiresAt <= now) {
    await removeExpired(prisma, tokenHash, now, onExpired);
    return null;
  }
  // Conditional slide: a concurrent logout or expiry makes this match nothing instead of throwing.
  const { count } = await prisma.session.updateMany({
    where: { tokenHash, expiresAt: { gt: now } },
    data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlMs(found.shared)) },
  });
  if (count === 0) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session) return null;
  return { user: found.user, session };
}

/**
 * Validity check for a token that never slides the expiry. Used where activity is not the user's own
 * (WebSocket connects, subscription deliveries, periodic checks), so an idle shared screen still
 * expires. An expired session is removed (and `onExpired` told).
 */
export async function checkSession(prisma: PrismaClient, token: string, now: Date = new Date(), onExpired?: ExpiryListener): Promise<User | null> {
  return checkSessionHash(prisma, hashToken(token), now, onExpired);
}

/** `checkSession` by the token's hash (for holders that keep only the hash, e.g. camera viewers). */
export async function checkSessionHash(
  prisma: PrismaClient,
  tokenHash: string,
  now: Date = new Date(),
  onExpired?: ExpiryListener,
): Promise<User | null> {
  const found = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!found) return null;
  if (found.expiresAt > now) return found.user;
  await removeExpired(prisma, tokenHash, now, onExpired);
  return null;
}

/** Deletes an expired session; only the call whose delete removed it tells `onExpired`, so it fires once. */
async function removeExpired(prisma: PrismaClient, tokenHash: string, now: Date, onExpired?: ExpiryListener): Promise<void> {
  const { count } = await prisma.session.deleteMany({ where: { tokenHash, expiresAt: { lte: now } } });
  if (count > 0) onExpired?.(tokenHash);
}

export async function logout(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
