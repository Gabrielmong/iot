import { badInput, notFound } from "../api-errors.js";
import { hashPin } from "../auth/pin.js";
import type { Prisma, PrismaClient, Role, User } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import { prepareGuest } from "./become-guest.js";
import { GUEST_HIDDEN_KINDS } from "./guest-rules.js";
import { assertNotLastAdmin, withAdminLock } from "./admin-lock.js";
import type { ServiceDeps } from "./deps.js";
import { uniqueName } from "./prisma-errors.js";
import { parseAvatarImage, parseColor, parseName, parsePin } from "./user-input.js";

export type NewUser = { name: string; pin?: string | null; role: Role; avatarColor: string; avatarImage?: string | null };
/** null/absent leaves a field unchanged; for avatarImage, "" clears it. */
export type UserPatch = { name?: string | null; role?: Role | null; avatarColor?: string | null; avatarImage?: string | null; pin?: string | null; clearPin?: boolean | null };

export function listUsers(prisma: PrismaClient): Promise<User[]> {
  return prisma.user.findMany({ orderBy: { name: "asc" } });
}

export async function createUser(prisma: PrismaClient, input: NewUser): Promise<User> {
  const data = { name: parseName(input.name), role: input.role, avatarColor: parseColor(input.avatarColor), avatarImage: input.avatarImage ? parseAvatarImage(input.avatarImage) : null, pinHash: input.role === "GUEST" && !input.pin ? null : await hashPin(parsePin(input.pin ?? "")) };
  return uniqueName(() => prisma.user.create({ data }));
}

/**
 * A role or PIN change signs the user out everywhere (their sockets then close with 4401), so no
 * session keeps acting with the old rights. A role change also publishes DEVICES_CHANGED, since
 * admins see every adopted device.
 */
export async function updateUser(deps: Pick<ServiceDeps, "prisma" | "pubsub" | "sessionEvents" | "routines" | "grantEvents">, id: string, patch: UserPatch): Promise<User> {
  const data = await userUpdate(patch);
  const { user, roleChanged, signedOut, droppedRoutines, droppedGrants } = await uniqueName(() =>
    withAdminLock(deps.prisma, async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw notFound("User");
      const role = patch.role ?? existing.role;
      if (patch.clearPin && role !== "GUEST") throw badInput("Only guests can have no PIN");
      if (role !== "GUEST" && existing.pinHash === null && data.pinHash === undefined) throw badInput("A PIN is required for users and admins");
      if (existing.role === "ADMIN" && role !== "ADMIN") await assertNotLastAdmin(tx, id);
      const becomesGuest = role === "GUEST" && existing.role !== "GUEST";
      const droppedGrants = becomesGuest ? (await tx.deviceGrant.findMany({ where: { userId: id, device: { kind: { in: [...GUEST_HIDDEN_KINDS] } } } })).map((g) => g.deviceId) : [];
      const droppedRoutines = becomesGuest ? await prepareGuest(tx, id) : [];
      const user = await tx.user.update({ where: { id }, data });
      const roleChanged = user.role !== existing.role;
      const signedOut = roleChanged || data.pinHash !== undefined;
      if (signedOut) await tx.session.deleteMany({ where: { userId: id } });
      return { user, roleChanged, signedOut, droppedRoutines, droppedGrants };
    }),
  );
  for (const routineId of droppedRoutines) deps.routines.stop(routineId);
  for (const deviceId of droppedGrants) deps.grantEvents.emit("grantsChanged", deviceId);
  if (signedOut) deps.sessionEvents.emit("sessionsRevoked", id);
  if (roleChanged) await publishDevicesChanged(deps.pubsub);
  return user;
}

/** Deleting the last admin is refused. Sessions and grants go with the user (cascade). */
export async function deleteUser(deps: Pick<ServiceDeps, "prisma" | "sessionEvents" | "routines">, id: string): Promise<void> {
  for (const r of await deps.prisma.routine.findMany({ where: { ownerId: id }, select: { id: true } })) deps.routines.stop(r.id);
  await withAdminLock(deps.prisma, async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } });
    if (!existing) throw notFound("User");
    if (existing.role === "ADMIN") await assertNotLastAdmin(tx, id);
    await tx.user.delete({ where: { id } });
  });
  deps.sessionEvents.emit("sessionsRevoked", id);
}

async function userUpdate(patch: UserPatch): Promise<Prisma.UserUpdateInput> {
  const data: Prisma.UserUpdateInput = {};
  if (patch.name != null) data.name = parseName(patch.name);
  if (patch.avatarColor != null) data.avatarColor = parseColor(patch.avatarColor);
  if (patch.avatarImage != null) data.avatarImage = parseAvatarImage(patch.avatarImage);
  if (patch.role != null) data.role = patch.role;
  if (patch.clearPin && patch.pin) throw badInput("Set or clear the PIN, not both");
  if (patch.clearPin) Object.assign(data, { pinHash: null, failedPinCount: 0, lockedUntil: null });
  if (patch.pin != null && !patch.clearPin) Object.assign(data, { pinHash: await hashPin(parsePin(patch.pin)), failedPinCount: 0, lockedUntil: null });
  return data;
}
