import { changeMyPin } from "../../auth/change-pin.js";
import { listGrants, setGrants } from "../../services/grants.js";
import { createUser, deleteUser, listUsers, updateUser, type NewUser, type UserPatch } from "../../services/users.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";
import { refuseGuest } from "../../services/guest-rules.js";
import { toApiUser } from "../mappers.js";

export const userResolvers = {
  Query: {
    users: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return (await listUsers(ctx.prisma)).map(toApiUser);
    },
    grants: async (_: unknown, { userId }: { userId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return listGrants(ctx.prisma, userId);
    },
  },
  Mutation: {
    createUser: async (_: unknown, input: NewUser, ctx: ApiContext) => {
      requireAdmin(ctx);
      return toApiUser(await createUser(ctx.prisma, input));
    },
    updateUser: async (_: unknown, { id, ...patch }: UserPatch & { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return toApiUser(await updateUser(ctx.deps, id, patch));
    },
    /** Self-service: only name and avatar, never role or PIN (those stay with admins). */
    updateProfile: async (_: unknown, { name, avatarColor, avatarImage }: Pick<UserPatch, "name" | "avatarColor" | "avatarImage">, ctx: ApiContext) => {
      const me = requireUser(ctx);
      refuseGuest(me, "edit their profile");
      return toApiUser(await updateUser(ctx.deps, me.id, { name, avatarColor, avatarImage }));
    },
    changeMyPin: async (_: unknown, { currentPin, newPin }: { currentPin: string; newPin: string }, ctx: ApiContext) => {
      const me = requireUser(ctx);
      await changeMyPin(ctx.deps, me, ctx.token!, currentPin, newPin);
      return true;
    },
    deleteUser: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await deleteUser(ctx.deps, id);
      return true;
    },
    setGrants: async (_: unknown, { userId, deviceIds }: { userId: string; deviceIds: string[] }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setGrants(ctx.deps, userId, deviceIds);
    },
  },
};
