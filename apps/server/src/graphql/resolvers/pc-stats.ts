import { PC_STATS, type PcStatsPayload } from "../../agent/stats-broker.js";
import { pcPermissions } from "../../services/computer-grants.js";
import type { ApiContext } from "../context.js";
import { requirePcPermission } from "../guards.js";

/** Whether the subscriber may still watch this PC's stats; false on any failure (fail closed). */
async function stillAllowed(ctx: ApiContext, deviceId: string): Promise<boolean> {
  try {
    const user = ctx.watch ? await ctx.watch.check() : ctx.user;
    return user !== null && (await pcPermissions(ctx.prisma, user, deviceId)).stats;
  } catch {
    return false;
  }
}

/**
 * One PC's samples while this subscription lives: it counts as a watcher (so the agent samples), and it ends
 * as soon as the subscriber loses Live stats or the PC is removed; every sample re-checks the permission first.
 */
function statsStream(ctx: ApiContext, deviceId: string): AsyncIterableIterator<PcStatsPayload> {
  const inner = ctx.pubsub.asyncIterableIterator<PcStatsPayload>(PC_STATS);
  const release = ctx.deps.pcStats.watch(deviceId);
  const events = ctx.deps.grantEvents;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    release();
    events.off("grantsChanged", onGrants);
    events.off("deviceRemoved", onRemoved);
    void inner.return?.();
  };
  const onGrants = (id: string) => {
    if (id === deviceId) void stillAllowed(ctx, deviceId).then((ok) => ok || end());
  };
  const onRemoved = (id: string) => {
    if (id === deviceId) end();
  };
  events.on("grantsChanged", onGrants);
  events.on("deviceRemoved", onRemoved);
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      for (;;) {
        const r = await inner.next();
        if (r.done || done) {
          end();
          return { done: true, value: undefined };
        }
        if (r.value.deviceId !== deviceId) continue;
        if (await stillAllowed(ctx, deviceId)) return r; // also catches a signed-out session or a change made without an event
        end();
        return { done: true, value: undefined };
      }
    },
    async return() {
      end();
      return { done: true, value: undefined };
    },
    async throw(e: unknown) {
      end();
      throw e;
    },
  };
}

/** Live stats of a PC (Live stats permission); nothing is stored. */
export const pcStatsResolvers = {
  Subscription: {
    pcStats: {
      subscribe: async (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
        await requirePcPermission(ctx, deviceId, "stats");
        return statsStream(ctx, deviceId);
      },
      resolve: (payload: PcStatsPayload) => payload.stats,
    },
  },
};
