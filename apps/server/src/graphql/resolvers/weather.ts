import { withFilter } from "graphql-subscriptions";
import { toApiWeather } from "../../weather/view.js";
import { readWeatherOptions, updateWeatherOptions, type WeatherOptions } from "../../weather/settings.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";
import { weatherUpdatedEvents } from "../pubsub.js";

const withStatus = (o: WeatherOptions, ctx: ApiContext) => ({ ...o, lastError: ctx.deps.weather.state().lastError });
const currentWeather = (ctx: ApiContext) => toApiWeather(ctx.deps.weather.state(), ctx.deps.now());

export const weatherResolvers = {
  Query: {
    weather: (_: unknown, __: unknown, ctx: ApiContext) => {
      requireUser(ctx);
      return currentWeather(ctx);
    },
    weatherSettings: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return withStatus(await readWeatherOptions(ctx.prisma), ctx);
    },
  },
  Mutation: {
    updateWeatherSettings: async (_: unknown, { input }: { input: WeatherOptions }, ctx: ApiContext) => {
      requireAdmin(ctx);
      const saved = await updateWeatherOptions(ctx.prisma, { ...input, lat: input.lat ?? null, lng: input.lng ?? null, address: input.address ?? null });
      await ctx.deps.weather.reconfigure();
      return withStatus(saved, ctx);
    },
  },
  Subscription: {
    weatherUpdated: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => weatherUpdatedEvents(ctx.pubsub),
          async () => (await Promise.resolve(ctx.watch ? ctx.watch.check() : ctx.user).catch(() => null)) !== null,
        )(root, args, ctx);
      },
      resolve: (_: unknown, __: unknown, ctx: ApiContext) => currentWeather(ctx),
    },
  },
};
