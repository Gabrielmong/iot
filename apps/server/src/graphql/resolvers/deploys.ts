import { toApiDeployStatus } from "../../deployer/status-map.js";
import type { Command } from "../../deployer/types.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";

const send = (ctx: ApiContext, command: { type: "deployNow" | "restartApp" | "pause" | "resume" } | { type: "rollback"; sha: string }) =>
  ctx.deps.deployer.command({ ...command, by: requireAdmin(ctx).name } as Command);

export const deployResolvers = {
  Query: {
    deployStatus: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return toApiDeployStatus(await ctx.deps.deployer.status());
    },
    deployLog: async (_: unknown, { eventId }: { eventId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return ctx.deps.deployer.log(eventId);
    },
  },
  Mutation: {
    deployNow: (_: unknown, __: unknown, ctx: ApiContext) => send(ctx, { type: "deployNow" }),
    restartApp: (_: unknown, __: unknown, ctx: ApiContext) => send(ctx, { type: "restartApp" }),
    pauseAutoDeploy: (_: unknown, __: unknown, ctx: ApiContext) => send(ctx, { type: "pause" }),
    resumeAutoDeploy: (_: unknown, __: unknown, ctx: ApiContext) => send(ctx, { type: "resume" }),
    rollbackDeploy: (_: unknown, { sha }: { sha: string }, ctx: ApiContext) => send(ctx, { type: "rollback", sha }),
  },
};
