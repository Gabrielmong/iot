import { badInput } from "../api-errors.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";
import type { ServiceDeps } from "./deps.js";
import { canAccessDevice } from "./grants.js";

type Deps = Pick<ServiceDeps, "prisma" | "grantEvents">;
export type PcPermission = "stats" | "power";
export type ComputerGrant = { userId: string; stats: boolean; power: boolean };
export type PcPermissions = { see: boolean; stats: boolean; power: boolean };

/** What a user may do with a PC: admins everything; guests nothing (they never see PCs); others per grant. */
export async function pcPermissions(prisma: PrismaClient, user: Pick<User, "id" | "role">, deviceId: string): Promise<PcPermissions> {
  if (user.role === "ADMIN") return { see: true, stats: true, power: true };
  if (!(await canAccessDevice(prisma, user, deviceId))) return { see: false, stats: false, power: false };
  const grant = await prisma.deviceGrant.findUnique({ where: { userId_deviceId: { userId: user.id, deviceId } } });
  return { see: true, stats: grant?.stats ?? false, power: grant?.power ?? false };
}

async function computerOrThrow(prisma: PrismaClient, deviceId: string): Promise<void> {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { kind: true } });
  if (!device) throw badInput("Unknown device");
  if (device.kind !== "COMPUTER") throw badInput("Only computers have stats and power permissions");
}

/** Every user granted the PC, with their Live stats / Power flags. */
export async function listComputerGrants(prisma: PrismaClient, deviceId: string): Promise<ComputerGrant[]> {
  await computerOrThrow(prisma, deviceId);
  const rows = await prisma.deviceGrant.findMany({ where: { deviceId }, orderBy: { userId: "asc" } });
  return rows.map(({ userId, stats, power }) => ({ userId, stats, power }));
}

/**
 * Sets the flags of users already granted the PC (others are left as they are). Announces a change so live
 * stats watchers who lost Live stats are dropped.
 */
export async function setComputerGrants(deps: Deps, deviceId: string, grants: ComputerGrant[]): Promise<ComputerGrant[]> {
  await computerOrThrow(deps.prisma, deviceId);
  const changed = await deps.prisma.$transaction(async (tx) => {
    const current = new Map((await tx.deviceGrant.findMany({ where: { deviceId } })).map((g) => [g.userId, g]));
    let any = false;
    for (const g of grants) {
      const row = current.get(g.userId);
      if (!row) {
        const user = await tx.user.findUnique({ where: { id: g.userId }, select: { name: true } });
        throw badInput(user ? `Give ${user.name} access to this PC first` : "Unknown user");
      }
      if (row.stats === g.stats && row.power === g.power) continue;
      await tx.deviceGrant.update({ where: { userId_deviceId: { userId: g.userId, deviceId } }, data: { stats: g.stats, power: g.power } });
      any = true;
    }
    return any;
  });
  if (changed) deps.grantEvents.emit("grantsChanged", deviceId);
  return listComputerGrants(deps.prisma, deviceId);
}
