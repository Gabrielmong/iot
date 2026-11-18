import { badInput } from "../api-errors.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { guestRefusalFor, hiddenFromGuests, isGuest } from "./guest-rules.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "grantEvents">;

/** User ids with an explicit grant for the device. */
export async function listDeviceGrants(prisma: Deps["prisma"], deviceId: string): Promise<string[]> {
  const rows = await prisma.deviceGrant.findMany({ where: { deviceId }, orderBy: { userId: "asc" } });
  return rows.map((r) => r.userId);
}

/** Replaces who may use one device. ADMIN ids are ignored (admins have implicit access). */
export async function setDeviceGrants(deps: Deps, deviceId: string, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds)];
  const changed = await deps.prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id: deviceId } });
    if (!device) throw badInput("Unknown device");
    const users = await tx.user.findMany({ where: { id: { in: ids } } });
    if (users.length !== ids.length) throw badInput("Unknown user");
    if (hiddenFromGuests(device.kind) && users.some(isGuest)) throw badInput(guestRefusalFor(device.kind));
    const wanted = users.filter((u) => u.role !== "ADMIN").map((u) => u.id);
    const before = (await tx.deviceGrant.findMany({ where: { deviceId } })).map((r) => r.userId);
    // Users who keep access keep their PC flags (Live stats, Power): only the difference is written.
    await tx.deviceGrant.deleteMany({ where: { deviceId, userId: { notIn: wanted } } });
    await tx.deviceGrant.createMany({ data: wanted.filter((id) => !before.includes(id)).map((userId) => ({ userId, deviceId })) });
    return before.length !== wanted.length || before.some((id) => !wanted.includes(id));
  });
  if (changed) deps.grantEvents.emit("grantsChanged", deviceId);
  await publishDevicesChanged(deps.pubsub);
  return listDeviceGrants(deps.prisma, deviceId);
}

/** Throws BAD_USER_INPUT when the device does not exist. */
export async function deviceGrantsFor(prisma: Deps["prisma"], deviceId: string): Promise<string[]> {
  if (!(await prisma.device.findUnique({ where: { id: deviceId } }))) throw badInput("Unknown device");
  return listDeviceGrants(prisma, deviceId);
}
