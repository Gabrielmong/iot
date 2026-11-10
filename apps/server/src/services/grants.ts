import { badInput, notFound } from "../api-errors.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { GUEST_HIDDEN_KINDS, guestRefusalFor, hiddenFromGuests, isGuest } from "./guest-rules.js";

/** Admins may operate every device; users only the ones granted to them. Always read fresh from the DB. */
export async function canAccessDevice(prisma: PrismaClient, user: Pick<User, "id" | "role">, deviceId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (isGuest(user)) {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { kind: true } });
    if (device && hiddenFromGuests(device.kind)) return false;
  }
  const grant = await prisma.deviceGrant.findUnique({ where: { userId_deviceId: { userId: user.id, deviceId } } });
  return grant !== null;
}

export async function listGrants(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.deviceGrant.findMany({ where: { userId }, orderBy: { deviceId: "asc" } });
  return rows.map((r) => r.deviceId);
}

/** Replaces a user's grants. Open subscriptions see the change on their next event. */
export async function setGrants(deps: Pick<ServiceDeps, "prisma" | "pubsub" | "grantEvents">, userId: string, deviceIds: string[]): Promise<string[]> {
  const ids = [...new Set(deviceIds)];
  const changedDevices = await deps.prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw notFound("User");
    if ((await tx.device.count({ where: { id: { in: ids } } })) !== ids.length) throw badInput("Unknown device");
    if (isGuest(target)) {
      const hidden = await tx.device.findFirst({ where: { id: { in: ids }, kind: { in: [...GUEST_HIDDEN_KINDS] } }, orderBy: { kind: "asc" } });
      if (hidden) throw badInput(guestRefusalFor(hidden.kind));
    }
    const before = (await tx.deviceGrant.findMany({ where: { userId } })).map((r) => r.deviceId);
    await tx.deviceGrant.deleteMany({ where: { userId } });
    await tx.deviceGrant.createMany({ data: ids.map((deviceId) => ({ userId, deviceId })) });
    return [...before.filter((d) => !ids.includes(d)), ...ids.filter((d) => !before.includes(d))];
  });
  for (const deviceId of changedDevices) deps.grantEvents.emit("grantsChanged", deviceId);
  await publishDevicesChanged(deps.pubsub);
  return listGrants(deps.prisma, userId);
}
