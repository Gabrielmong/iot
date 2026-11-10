import type { DeviceState } from "../../devices/types.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";

/** A trial's state as the API shows it: on/off only (lights report through `light.on`). */
const trial = (deviceId: string, s: DeviceState) => ({ deviceId, state: { online: s.online, on: s.on ?? s.light?.on ?? null, light: null } });

export const trialResolvers = {
  Mutation: {
    startDeviceTrial: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return trial(id, await ctx.manager.startTrial(id));
    },
    setTrialState: async (_: unknown, { id, on }: { id: string; on: boolean }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return trial(id, await ctx.manager.setTrialState(id, on));
    },
    endDeviceTrial: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await ctx.manager.endTrial(id);
      return true;
    },
  },
};
