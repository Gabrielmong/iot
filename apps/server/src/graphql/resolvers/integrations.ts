import { integrationStatus, setKasaCredentials, setTuyaCloud } from "../../services/integrations.js";
import { addKasaByIp } from "../../services/kasa-add.js";
import { setSwannRecorder } from "../../services/swann.js";
import { setTuyaLocalKey } from "../../services/tuya-keys.js";
import { syncTuyaKeys } from "../../services/tuya-sync.js";
import { googleMapsKey, setGoogleMapsKey, setXweatherCredentials, testXweather } from "../../weather/credentials.js";
import { locationOf, readWeatherOptions } from "../../weather/settings.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";
import { adminDeviceView } from "../admin-device.js";

type TuyaCloudArgs = { accessId: string; accessSecret: string; region: string };

/** Credentials go in through these mutations and never come back out: only "configured" flags do. */
export const integrationResolvers = {
  Query: {
    integrations: (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return integrationStatus(ctx.prisma);
    },
    mapsApiKey: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return (await googleMapsKey(ctx.deps)) ?? null;
    },
  },
  Mutation: {
    setTuyaCloud: (_: unknown, args: TuyaCloudArgs, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setTuyaCloud(ctx.deps, args);
    },
    syncTuyaKeys: (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return syncTuyaKeys(ctx.deps);
    },
    setTuyaLocalKey: async (_: unknown, { deviceId, localKey }: { deviceId: string; localKey: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await setTuyaLocalKey(ctx.deps, deviceId, localKey));
    },
    setKasaCredentials: (_: unknown, { username, password }: { username: string; password: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setKasaCredentials(ctx.deps, username, password);
    },
    setSwannRecorder: (_: unknown, args: { host: string; username: string; password: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setSwannRecorder(ctx.deps, args);
    },
    setXweatherCredentials: async (_: unknown, { clientId, clientSecret }: { clientId: string; clientSecret: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await setXweatherCredentials(ctx.deps, clientId, clientSecret);
      await ctx.deps.weather.reconfigure();
      return integrationStatus(ctx.prisma);
    },
    setGoogleMapsKey: async (_: unknown, { apiKey }: { apiKey: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await setGoogleMapsKey(ctx.deps, apiKey);
      return integrationStatus(ctx.prisma);
    },
    testXweather: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return testXweather(ctx.deps, locationOf(await readWeatherOptions(ctx.prisma)));
    },
    addKasaByIp: async (_: unknown, { ip }: { ip: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await addKasaByIp(ctx.deps, ip));
    },
  },
};
