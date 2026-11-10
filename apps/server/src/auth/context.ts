import type { PubSub } from "graphql-subscriptions";
import type { DeviceManager } from "../devices/manager.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";
import { resolveSession, type ExpiryListener } from "./sessions.js";

export type Ctx = {
  user: User | null;
  isAdmin: boolean;
  prisma: PrismaClient;
  manager: DeviceManager;
  pubsub: PubSub;
};

export type ContextDeps = Pick<Ctx, "prisma" | "manager" | "pubsub">;

const BEARER = /^Bearer\s+(.+)$/i;

/** Extracts a token from an Authorization header value; a bare token is accepted as-is. */
export function tokenFromAuthHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return BEARER.exec(raw)?.[1] ?? raw;
}

/** Builds the per-request context from a raw token (HTTP header or WebSocket connectionParams). */
export async function buildContext(
  deps: ContextDeps,
  token: string | null | undefined,
  now: Date = new Date(),
  onExpired?: ExpiryListener,
): Promise<Ctx> {
  const resolved = token ? await resolveSession(deps.prisma, token, now, onExpired) : null;
  const user = resolved?.user ?? null;
  return { ...deps, user, isAdmin: user?.role === "ADMIN" };
}
