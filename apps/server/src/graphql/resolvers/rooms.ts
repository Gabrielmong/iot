import { createRoom, deleteRoom, listRooms, updateRoom, type RoomPatch } from "../../services/rooms.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";
import { toApiRoom } from "../mappers.js";

export const roomResolvers = {
  Query: {
    rooms: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireUser(ctx);
      return (await listRooms(ctx.prisma)).map(toApiRoom);
    },
  },
  Mutation: {
    createRoom: async (_: unknown, { name }: { name: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return toApiRoom(await createRoom(ctx.deps, name));
    },
    updateRoom: async (_: unknown, { id, ...patch }: RoomPatch & { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return toApiRoom(await updateRoom(ctx.deps, id, patch));
    },
    deleteRoom: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await deleteRoom(ctx.deps, id);
      return true;
    },
  },
};
