import { withFilter } from "graphql-subscriptions";
import { PC_POWER, type PcPowerAction, type PcPowerState } from "../../agent/power.js";
import { canAccessDevice } from "../../services/grants.js";
import type { ApiContext } from "../context.js";
import { requirePcPermission, requireUser } from "../guards.js";

/** Grants are read on each event, so someone who loses access to the PC stops hearing about it at once. */
async function maySee(ctx: ApiContext, deviceId: string): Promise<boolean> {
  try {
    const user = ctx.watch ? await ctx.watch.check() : ctx.user;
    return user !== null && (await canAccessDevice(ctx.prisma, user, deviceId));
  } catch {
    return false; // fail closed
  }
}

/** Sleep, shut down and restart a PC through its HomeAgent (Power permission), and follow the countdown. */
export const pcPowerResolvers = {
  Mutation: {
    pcPower: async (_: unknown, { deviceId, action }: { deviceId: string; action: PcPowerAction }, ctx: ApiContext) => {
      const user = await requirePcPermission(ctx, deviceId, "power");
      return ctx.deps.pcPower.request(deviceId, action, user.name);
    },
    pcPowerCancel: async (_: unknown, { deviceId, id }: { deviceId: string; id: string }, ctx: ApiContext) => {
      await requirePcPermission(ctx, deviceId, "power");
      return ctx.deps.pcPower.cancel(deviceId, id);
    },
  },
  Subscription: {
    pcPowerState: {
      subscribe: (root: unknown, args: { deviceId: string }, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => ctx.pubsub.asyncIterableIterator<PcPowerState>(PC_POWER),
          async (payload) => !!payload && (payload as PcPowerState).deviceId === args.deviceId && maySee(ctx, args.deviceId),
        )(root, args, ctx);
      },
      resolve: (payload: PcPowerState) => payload,
    },
  },
};
