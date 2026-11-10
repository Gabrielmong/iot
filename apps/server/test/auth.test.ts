import { PubSub } from "graphql-subscriptions";
import { GraphQLError } from "graphql";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildContext, tokenFromAuthHeader } from "../src/auth/context.js";
import { clearFailedAttempts } from "../src/auth/lockout.js";
import { login } from "../src/auth/login.js";
import { hashPin, isValidPin, verifyPin } from "../src/auth/pin.js";
import { hashToken, logout, resolveSession } from "../src/auth/sessions.js";
import type { DeviceManager } from "../src/devices/manager.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { closeDb, resetDb } from "./helpers.js";

const PIN = "1234";
const T0 = new Date("2026-01-01T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

let prisma: PrismaClient;
let userId: string;

async function seedUser(role: "ADMIN" | "USER" = "USER", name = "Ana"): Promise<string> {
  const user = await prisma.user.create({
    data: { name, avatarColor: "#fff", role, pinHash: await hashPin(PIN) },
  });
  return user.id;
}

async function expectGraphQLError(p: Promise<unknown>, code: string): Promise<GraphQLError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GraphQLError);
  expect((err as GraphQLError).extensions.code).toBe(code);
  return err as GraphQLError;
}

beforeEach(async () => {
  prisma = await resetDb();
  userId = await seedUser();
});
afterAll(closeDb);

describe("pin hashing", () => {
  it("accepts only 4-8 digit PINs", async () => {
    for (const ok of ["1234", "12345678", "0000"]) expect(isValidPin(ok)).toBe(true);
    for (const bad of ["123", "123456789", "12a4", "", " 1234", "12 34"]) {
      expect(isValidPin(bad)).toBe(false);
      await expect(hashPin(bad)).rejects.toThrow(/4 to 8 digits/);
    }
  });

  it("verifies the right PIN, rejects wrong ones, and salts each hash", async () => {
    const hash = await hashPin(PIN);
    expect(hash).not.toContain(PIN);
    expect(hash).not.toBe(await hashPin(PIN));
    expect(await verifyPin(PIN, hash)).toBe(true);
    expect(await verifyPin("4321", hash)).toBe(false);
  });

  it("returns false for malformed stored hashes", async () => {
    for (const bad of ["", "plain", "scrypt$1$2$3$a", "scrypt$x$8$1$AA$AA", "scrypt$16384$8$1$AA$"]) {
      expect(await verifyPin(PIN, bad)).toBe(false);
    }
  });
});

describe("login and sessions", () => {
  it("logs in with a valid PIN and stores only the token's SHA-256", async () => {
    const { token, user } = await login(prisma, userId, PIN, false, T0);
    expect(user.id).toBe(userId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("rejects a wrong PIN with attemptsLeft and an unknown user generically", async () => {
    const err = await expectGraphQLError(login(prisma, userId, "9999", false, T0), "INVALID_PIN");
    expect(err.extensions.attemptsLeft).toBe(4);
    await expectGraphQLError(login(prisma, "nope", PIN, false, T0), "INVALID_PIN");
  });

  it("locks after 5 wrong PINs, even for the correct PIN, then recovers after 60s", async () => {
    for (let i = 0; i < 5; i++) {
      const err = await expectGraphQLError(login(prisma, userId, "9999", false, T0), "INVALID_PIN");
      expect(err.extensions.attemptsLeft).toBe(4 - i);
    }
    const locked = await expectGraphQLError(login(prisma, userId, PIN, false, at(1000)), "LOCKED");
    expect(locked.extensions.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(locked.extensions.retryAfterSeconds).toBeGreaterThan(0);

    const { token } = await login(prisma, userId, PIN, false, at(60_000));
    expect(token).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedPinCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("restarts the count after an expired lock instead of relocking at once", async () => {
    for (let i = 0; i < 5; i++) await login(prisma, userId, "9999", false, T0).catch(() => undefined);
    const err = await expectGraphQLError(login(prisma, userId, "9999", false, at(61_000)), "INVALID_PIN");
    expect(err.extensions.attemptsLeft).toBe(4);
  });

  it("a successful login resets the failure counter", async () => {
    for (let i = 0; i < 3; i++) await login(prisma, userId, "9999", false, T0).catch(() => undefined);
    await login(prisma, userId, PIN, false, T0);
    const err = await expectGraphQLError(login(prisma, userId, "9999", false, T0), "INVALID_PIN");
    expect(err.extensions.attemptsLeft).toBe(4);
  });

  it("allows at most 5 INVALID_PIN in a parallel burst, the rest LOCKED", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => login(prisma, userId, "9999", false, T0)),
    );
    const codes = results.map((r) => (r.status === "rejected" ? (r.reason as GraphQLError).extensions.code : "OK"));
    expect(codes.filter((c) => c === "INVALID_PIN")).toHaveLength(5);
    expect(codes.filter((c) => c === "LOCKED")).toHaveLength(5);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedPinCount).toBeLessThanOrEqual(5);
    expect(user.lockedUntil).not.toBeNull();
    await expectGraphQLError(login(prisma, userId, PIN, false, at(1000)), "LOCKED");
  });

  it("never logs in the correct PIN once 5 wrong attempts have locked the account", async () => {
    for (let i = 0; i < 5; i++) await login(prisma, userId, "9999", false, T0).catch(() => undefined);
    await expectGraphQLError(login(prisma, userId, PIN, false, T0), "LOCKED");
    expect(await prisma.session.count()).toBe(0);
  });

  it("does not clear a lock set concurrently by another failure", async () => {
    const lockedUntil = at(60_000);
    await prisma.user.update({ where: { id: userId }, data: { failedPinCount: 5, lockedUntil } });
    expect(await clearFailedAttempts(prisma, userId, T0, null)).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lockedUntil).toEqual(lockedUntil);
    expect(user.failedPinCount).toBe(5);
  });

  it("lets a correct PIN on the 5th attempt succeed and clears its own lock", async () => {
    for (let i = 0; i < 4; i++) await login(prisma, userId, "9999", false, T0).catch(() => undefined);
    const { user } = await login(prisma, userId, PIN, false, T0);
    expect(user.failedPinCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("answers an unknown or deleted user like a first miss", async () => {
    const err = await expectGraphQLError(login(prisma, "nope", PIN, false, T0), "INVALID_PIN");
    expect(err.extensions.attemptsLeft).toBe(4);
    await prisma.user.delete({ where: { id: userId } });
    const gone = await expectGraphQLError(login(prisma, userId, PIN, false, T0), "INVALID_PIN");
    expect(gone.extensions.attemptsLeft).toBe(4);
  });

  it("returns a fresh user after login", async () => {
    await login(prisma, userId, "9999", false, T0).catch(() => undefined);
    const { user } = await login(prisma, userId, PIN, false, T0);
    expect(user.failedPinCount).toBe(0);
  });

  it("is independent of the process timezone", async () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      for (let i = 0; i < 5; i++) await login(prisma, userId, "9999", false, T0).catch(() => undefined);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.lockedUntil).toEqual(at(60_000));
      await expectGraphQLError(login(prisma, userId, PIN, false, at(59_000)), "LOCKED");
      await login(prisma, userId, PIN, false, at(60_000));
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("expires shared sessions after 3 idle minutes but not personal ones", async () => {
    const shared = await login(prisma, userId, PIN, true, T0);
    const personal = await login(prisma, userId, PIN, false, T0);
    expect(await resolveSession(prisma, shared.token, at(3 * 60_000 + 1))).toBeNull();
    expect(await resolveSession(prisma, personal.token, at(3 * 60_000 + 1))).not.toBeNull();
  });

  it("slides shared expiry on activity and personal expiry to 90 days", async () => {
    const shared = await login(prisma, userId, PIN, true, T0);
    expect(await resolveSession(prisma, shared.token, at(2 * 60_000))).not.toBeNull();
    expect(await resolveSession(prisma, shared.token, at(4 * 60_000))).not.toBeNull();
    expect(await resolveSession(prisma, shared.token, at(4 * 60_000 + 3 * 60_000 + 1))).toBeNull();

    const personal = await login(prisma, userId, PIN, false, T0);
    const day = 24 * 60 * 60_000;
    const resolved = await resolveSession(prisma, personal.token, at(80 * day));
    expect(resolved?.session.expiresAt).toEqual(at(170 * day));
    expect(await resolveSession(prisma, personal.token, at(171 * day))).toBeNull();
  });

  it("treats a logout racing a resolve as a miss, not an error", async () => {
    const { token } = await login(prisma, userId, PIN, false, T0);
    const results = await Promise.all([
      resolveSession(prisma, token, at(1000)),
      logout(prisma, token),
      resolveSession(prisma, token, at(1000)),
    ]);
    expect([results[0], results[2]].every((r) => r === null || r.user.id === userId)).toBe(true);
  });

  it("rejects unknown tokens and logout invalidates the session", async () => {
    expect(await resolveSession(prisma, "garbage", T0)).toBeNull();
    const { token } = await login(prisma, userId, PIN, false, T0);
    await logout(prisma, token);
    expect(await resolveSession(prisma, token, T0)).toBeNull();
    await expect(logout(prisma, token)).resolves.toBeUndefined();
  });
});

describe("buildContext", () => {
  const deps = () => ({ prisma, manager: {} as DeviceManager, pubsub: new PubSub() });

  it("returns an anonymous context without or with a bad token", async () => {
    for (const token of [null, undefined, "", "bad"]) {
      const ctx = await buildContext(deps(), token, T0);
      expect(ctx.user).toBeNull();
      expect(ctx.isAdmin).toBe(false);
    }
  });

  it("resolves the user and admin flag from a token", async () => {
    const adminId = await seedUser("ADMIN", "Boss");
    const u = await login(prisma, userId, PIN, false, T0);
    const a = await login(prisma, adminId, PIN, false, T0);
    const userCtx = await buildContext(deps(), u.token, T0);
    const adminCtx = await buildContext(deps(), a.token, T0);
    expect(userCtx.user?.id).toBe(userId);
    expect(userCtx.isAdmin).toBe(false);
    expect(adminCtx.isAdmin).toBe(true);
  });

  it("parses Authorization headers", () => {
    expect(tokenFromAuthHeader("Bearer abc")).toBe("abc");
    expect(tokenFromAuthHeader("abc")).toBe("abc");
    expect(tokenFromAuthHeader(undefined)).toBeNull();
    expect(tokenFromAuthHeader([])).toBeNull();
  });
});
