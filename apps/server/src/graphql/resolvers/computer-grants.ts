import { listComputerGrants, pcPermissions, setComputerGrants, type ComputerGrant } from "../../services/computer-grants.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";

type Parent = { deviceId: string };

/** Who may watch a PC's live stats and use its power actions (admin-set), and what the viewer may do. */
export const computerGrantResolvers = {
  Query: {
    computerGrants: async (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return listComputerGrants(ctx.prisma, deviceId);
    },
  },
  Mutation: {
    setComputerGrants: async (_: unknown, { deviceId, grants }: { deviceId: string; grants: ComputerGrant[] }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setComputerGrants(ctx.deps, deviceId, grants);
    },
  },
  ComputerInfo: {
    canStats: async (p: Parent, _: unknown, ctx: ApiContext) => (await pcPermissions(ctx.prisma, requireUser(ctx), p.deviceId)).stats,
    canPower: async (p: Parent, _: unknown, ctx: ApiContext) => (await pcPermissions(ctx.prisma, requireUser(ctx), p.deviceId)).power,
  },
};
