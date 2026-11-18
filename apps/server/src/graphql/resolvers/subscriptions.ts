import { withFilter } from "graphql-subscriptions";
import { notFound } from "../../api-errors.js";
import type { DeviceStatePayload, RoutineRunPayload } from "../../devices/topics.js";
import { deviceVisibility, routineVisibility, viewRun } from "../../routines/problem-view.js";
import { isTryKey, tryKey } from "../../routines/run-service.js";
import { getRoutine } from "../../routines/store.js";
import type { User } from "../../generated/prisma/client.js";
import { deviceRow } from "../../services/device-rows.js";
import { canAccessDevice } from "../../services/grants.js";
import type { ApiContext } from "../context.js";
import { requireUser } from "../guards.js";
import { toApiDevice } from "../mappers.js";
import { cameraGroupsChangedEvents, devicesChangedEvents, deviceStateEvents, routineRunEvents, routinesChangedEvents } from "../pubsub.js";

/**
 * The subscriber as of now, re-read for every event without sliding the session. On a WebSocket an
 * expired or deleted session yields null (and the watch closes the socket with 4401).
 */
async function subscriberNow(ctx: ApiContext): Promise<User | null> {
  return ctx.watch ? ctx.watch.check() : ctx.user;
}

/** Grants are read from the DB on each event (no caching), so a revocation applies at once. */
async function mayReceive(ctx: ApiContext, deviceId: string): Promise<boolean> {
  try {
    const user = await subscriberNow(ctx);
    return user !== null && (await canAccessDevice(ctx.prisma, user, deviceId));
  } catch {
    return false; // fail closed (e.g. the DB is unreachable)
  }
}

/** The subscriber's own Try it run, or a routine they can see right now. */
async function mayReceiveRun(ctx: ApiContext, key: string): Promise<boolean> {
  try {
    const user = await subscriberNow(ctx);
    if (!user) return false;
    return isTryKey(key) ? key === tryKey(user.id) : (await getRoutine(ctx.prisma, user, key)) !== null;
  } catch {
    return false; // fail closed
  }
}

export const subscriptionResolvers = {
  Subscription: {
    deviceState: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => deviceStateEvents(ctx.pubsub),
          (payload) => (payload ? mayReceive(ctx, (payload as DeviceStatePayload).deviceId) : false),
        )(root, args, ctx);
      },
      resolve: async (payload: DeviceStatePayload, _: unknown, ctx: ApiContext) => {
        const row = await deviceRow(ctx.prisma, payload.deviceId);
        if (!row) throw notFound("Device");
        return toApiDevice(row, payload.state, requireUser(ctx), ctx.manager.tv.info(row), ctx.manager.computerInfo(row));
      },
    },
    devicesChanged: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => devicesChangedEvents(ctx.pubsub),
          async () => (await subscriberNow(ctx).catch(() => null)) !== null,
        )(root, args, ctx);
      },
      resolve: () => true,
    },
    routineRunChanged: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => routineRunEvents(ctx.pubsub),
          (payload) => (payload ? mayReceiveRun(ctx, (payload as RoutineRunPayload).key) : false),
        )(root, args, ctx);
      },
      resolve: async (payload: RoutineRunPayload, _: unknown, ctx: ApiContext) => {
        const user = requireUser(ctx);
        const canSee = await deviceVisibility(ctx.prisma, user);
        const canSeeRoutine = await routineVisibility(ctx.prisma, user);
        return { routineId: isTryKey(payload.key) ? "try" : payload.key, run: viewRun(payload.run, canSee, canSeeRoutine) };
      },
    },
    cameraGroupsChanged: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => cameraGroupsChangedEvents(ctx.pubsub),
          async () => (await subscriberNow(ctx).catch(() => null)) !== null,
        )(root, args, ctx);
      },
      resolve: () => true,
    },
    routinesChanged: {
      subscribe: (root: unknown, args: unknown, ctx: ApiContext) => {
        requireUser(ctx);
        return withFilter(
          () => routinesChangedEvents(ctx.pubsub),
          async () => (await subscriberNow(ctx).catch(() => null)) !== null,
        )(root, args, ctx);
      },
      resolve: () => true,
    },
  },
};
