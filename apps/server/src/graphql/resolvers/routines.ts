import type { User } from "../../generated/prisma/client.js";
import { deviceVisibility } from "../../routines/problem-view.js";
import { parseSteps, stepDeviceIds, type RoutineStep } from "../../routines/steps.js";
import { createRoutine, deleteRoutine, getRoutine, listOtherRoutines, listRoutines, updateRoutine, type RoutineInput, type RoutineRow } from "../../routines/store.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";
import { refuseGuest } from "../../services/guest-rules.js";
import { toApiRoutine } from "../routine-mappers.js";

async function toApi(ctx: ApiContext, user: User, rows: RoutineRow[]) {
  const canSee = await deviceVisibility(ctx.prisma, user);
  const ids = [...new Set(rows.flatMap((r) => stepDeviceIds(r.steps as RoutineStep[])))];
  const existing = new Set((await ctx.prisma.device.findMany({ where: { id: { in: ids }, adopted: true }, select: { id: true } })).map((d) => d.id));
  return rows.map((r) => toApiRoutine(r, user, canSee, existing));
}

const one = async (ctx: ApiContext, user: User, row: RoutineRow) => (await toApi(ctx, user, [row]))[0];

export const routineResolvers = {
  Query: {
    routines: async (_: unknown, __: unknown, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return toApi(ctx, user, await listRoutines(ctx.prisma, user));
    },
    otherRoutines: async (_: unknown, __: unknown, ctx: ApiContext) => {
      const admin = requireAdmin(ctx);
      return toApi(ctx, admin, await listOtherRoutines(ctx.prisma, admin));
    },
    routine: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      const row = await getRoutine(ctx.prisma, user, id);
      return row && one(ctx, user, row);
    },
  },
  Mutation: {
    createRoutine: async (_: unknown, { input }: { input: RoutineInput }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return one(ctx, user, await createRoutine(ctx.deps, user, input));
    },
    updateRoutine: async (_: unknown, { id, input }: { id: string; input: RoutineInput }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      return one(ctx, user, await updateRoutine(ctx.deps, user, id, input));
    },
    deleteRoutine: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      await deleteRoutine(ctx.deps, requireUser(ctx), id);
      return true;
    },
    runRoutine: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      await ctx.deps.routines.run(id, requireUser(ctx));
      return true;
    },
    stopRoutine: (_: unknown, { id }: { id: string }, ctx: ApiContext) => ctx.deps.routines.stopFor(id, requireUser(ctx)),
    /** Shape checks only: devices the caller can't use show up as run problems, not errors. */
    tryRoutine: (_: unknown, { input }: { input: RoutineInput }, ctx: ApiContext) => {
      const user = requireUser(ctx);
      refuseGuest(user, "try routines");
      ctx.deps.routines.tryDraft(user, parseSteps(input.steps), input.scope);
      return true;
    },
    stopTry: (_: unknown, __: unknown, ctx: ApiContext) => ctx.deps.routines.stopTry(requireUser(ctx).id),
  },
};
