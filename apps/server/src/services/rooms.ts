import { notFound } from "../api-errors.js";
import type { PrismaClient, Room } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import { deleteTabLayouts } from "./dashboard-layouts.js";
import type { ServiceDeps } from "./deps.js";
import { uniqueName } from "./prisma-errors.js";
import { parseName } from "./user-input.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub">;
export type RoomPatch = { name?: string | null; sortOrder?: number | null };

export function listRooms(prisma: PrismaClient): Promise<Room[]> {
  return prisma.room.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

/** New rooms go last. */
export async function createRoom(deps: Deps, name: string): Promise<Room> {
  const parsed = parseName(name, "Room name");
  const room = await uniqueName(async () => {
    const { _max } = await deps.prisma.room.aggregate({ _max: { sortOrder: true } });
    return deps.prisma.room.create({ data: { name: parsed, sortOrder: (_max.sortOrder ?? -1) + 1 } });
  });
  await publishDevicesChanged(deps.pubsub);
  return room;
}

export async function updateRoom(deps: Deps, id: string, patch: RoomPatch): Promise<Room> {
  const data = {
    ...(patch.name != null ? { name: parseName(patch.name, "Room name") } : {}),
    ...(patch.sortOrder != null ? { sortOrder: patch.sortOrder } : {}),
  };
  const room = await uniqueName(async () => {
    const { count } = await deps.prisma.room.updateMany({ where: { id }, data });
    if (count === 0) throw notFound("Room");
    return deps.prisma.room.findUniqueOrThrow({ where: { id } });
  });
  await publishDevicesChanged(deps.pubsub);
  return room;
}

/** Devices in the room become unassigned (onDelete: SetNull). */
export async function deleteRoom(deps: Deps, id: string): Promise<void> {
  const { count } = await deps.prisma.room.deleteMany({ where: { id } });
  if (count === 0) throw notFound("Room");
  await deleteTabLayouts(deps.prisma, id);
  await publishDevicesChanged(deps.pubsub);
}
