import type { Device, PrismaClient, Room, User } from "../generated/prisma/client.js";

import { GUEST_HIDDEN_KINDS, isGuest } from "./guest-rules.js";

/** A device with its room, as the API shows it. */
export type DeviceRow = Device & { room: Room | null };

const withRoom = { room: true } as const;

/** Adopted devices the user may see: all of them for an admin, granted ones for a user. `id` narrows to one device. */
export function visibleDevices(prisma: PrismaClient, user: Pick<User, "id" | "role">, id?: string): Promise<DeviceRow[]> {
  const granted = user.role === "ADMIN" ? {} : { grants: { some: { userId: user.id } } };
  const guestKinds = isGuest(user) ? { kind: { notIn: [...GUEST_HIDDEN_KINDS] } } : {};
  return prisma.device.findMany({ where: { adopted: true, ...(id === undefined ? {} : { id }), ...granted, ...guestKinds }, include: withRoom, orderBy: { name: "asc" } });
}

/** Every known device, adopted first. */
export function allDevices(prisma: PrismaClient): Promise<DeviceRow[]> {
  return prisma.device.findMany({ include: withRoom, orderBy: [{ adopted: "desc" }, { name: "asc" }] });
}

export function deviceRow(prisma: PrismaClient, id: string): Promise<DeviceRow | null> {
  return prisma.device.findUnique({ where: { id }, include: withRoom });
}
