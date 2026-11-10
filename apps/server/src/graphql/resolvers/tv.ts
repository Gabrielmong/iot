import type { TvApp, TvKey } from "../../devices/types.js";
import { addTvByIp } from "../../services/tv-add.js";
import { cancelTvPairing, finishTvPairing, startTvPairing } from "../../services/tv-pairing.js";
import { adminDeviceView } from "../admin-device.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireDeviceAccess } from "../guards.js";

/** The TV remote (anyone with access to the TV) and pairing (admin only). */
export const tvResolvers = {
  Mutation: {
    addTvByIp: async (_: unknown, { ip }: { ip: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await addTvByIp(ctx.deps, ip));
    },
    sendTvKey: async (_: unknown, { deviceId, key }: { deviceId: string; key: TvKey }, ctx: ApiContext) => {
      await requireDeviceAccess(ctx, deviceId);
      await ctx.manager.tv.sendKey(deviceId, key);
      return true;
    },
    launchTvApp: async (_: unknown, { deviceId, app }: { deviceId: string; app: TvApp }, ctx: ApiContext) => {
      await requireDeviceAccess(ctx, deviceId);
      await ctx.manager.tv.launchApp(deviceId, app);
      return true;
    },
    startTvPairing: (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return startTvPairing(ctx.deps, deviceId);
    },
    finishTvPairing: async (_: unknown, { deviceId, code }: { deviceId: string; code?: string | null }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await finishTvPairing(ctx.deps, deviceId, code));
    },
    cancelTvPairing: (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return cancelTvPairing(ctx.deps, deviceId);
    },
  },
};
