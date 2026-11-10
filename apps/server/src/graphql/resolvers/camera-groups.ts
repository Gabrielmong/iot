import { createGroup, deleteGroup, listGroups, listOtherGroups, updateGroup, type CameraGroupInput, type CameraGroupRow } from "../../camera-groups/store.js";
import type { User } from "../../generated/prisma/client.js";
import { deviceVisibility } from "../../routines/problem-view.js";
import { toApiCameraGroup } from "../camera-group-mappers.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";

async function toApi(ctx: ApiContext, user: User, rows: CameraGroupRow[]) {
  const canSee = await deviceVisibility(ctx.prisma, user);
  return rows.map((g) => toApiCameraGroup(g, user, canSee));
}

const one = async (ctx: ApiContext, user: User, row: CameraGroupRow) => (await toApi(ctx, user, [row]))[0];

export const cameraGroupResolvers = {
  Query: {
    cameraGroups: async (_: unknown, __: unknown, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return toApi(ctx, user, await listGroups(ctx.prisma, user));
    },
    otherCameraGroups: async (_: unknown, __: unknown, ctx: ApiContext) => {
      const admin = requireAdmin(ctx);
      return toApi(ctx, admin, await listOtherGroups(ctx.prisma, admin));
    },
  },
  Mutation: {
    createCameraGroup: async (_: unknown, { input }: { input: CameraGroupInput }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return one(ctx, user, await createGroup(ctx.deps, user, input));
    },
    updateCameraGroup: async (_: unknown, { id, input }: { id: string; input: CameraGroupInput }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return one(ctx, user, await updateGroup(ctx.deps, user, id, input));
    },
    deleteCameraGroup: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      await deleteGroup(ctx.deps, requireUser(ctx), id);
      return true;
    },
  },
};
