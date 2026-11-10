import type { DeviceKind } from "../../generated/prisma/client.js";
import { clearCameraOnvif, setCameraOnvif } from "../../services/camera-onvif.js";
import { allDevices, visibleDevices, type DeviceRow } from "../../services/device-rows.js";
import { getVisibleDevice } from "../../services/device-detail.js";
import { deviceGrantsFor, setDeviceGrants } from "../../services/device-grants.js";
import { adoptDevice, removeDevice, setDeviceState, updateDevice } from "../../services/devices.js";
import type { StatePatchInput } from "../../services/state-patch.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireDeviceAccess, requireUser } from "../guards.js";
import { adminDeviceView } from "../admin-device.js";
import { toApiDevice } from "../mappers.js";

type DeviceArgs = { id: string; name?: string | null; roomId?: string | null; kind?: DeviceKind | null };

const withState = (ctx: ApiContext) => (row: DeviceRow) => toApiDevice(row, ctx.manager.getState(row.id), ctx.user ?? undefined, ctx.manager.tv.info(row));

export const deviceResolvers = {
  Query: {
    devices: async (_: unknown, __: unknown, ctx: ApiContext) => (await visibleDevices(ctx.prisma, requireUser(ctx))).map(withState(ctx)),
    device: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      const row = await getVisibleDevice(ctx.deps, requireUser(ctx), id);
      return row && withState(ctx)(row);
    },
    adminDevices: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return (await allDevices(ctx.prisma)).map(adminDeviceView(ctx));
    },
    deviceGrants: async (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return deviceGrantsFor(ctx.prisma, deviceId);
    },
  },
  Mutation: {
    setDeviceState: async (_: unknown, { id, patch }: { id: string; patch: StatePatchInput }, ctx: ApiContext) => {
      await requireDeviceAccess(ctx, id);
      return withState(ctx)(await setDeviceState(ctx.deps, id, patch));
    },
    adoptDevice: async (_: unknown, { id, ...settings }: DeviceArgs & { name: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await adoptDevice(ctx.deps, id, settings));
    },
    updateDevice: async (_: unknown, { id, ...settings }: DeviceArgs, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await updateDevice(ctx.deps, id, settings));
    },
    setDeviceGrants: async (_: unknown, { deviceId, userIds }: { deviceId: string; userIds: string[] }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setDeviceGrants(ctx.deps, deviceId, userIds);
    },
    setCameraOnvif: async (_: unknown, args: { deviceId: string; username: string; password: string; confirmAddress?: string | null }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return withState(ctx)(await setCameraOnvif(ctx.deps, args));
    },
    clearCameraOnvif: async (_: unknown, { deviceId }: { deviceId: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return withState(ctx)(await clearCameraOnvif(ctx.deps, deviceId));
    },
    removeDevice: async (_: unknown, { id }: { id: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      await removeDevice(ctx.deps, id);
      return true;
    },
  },
};
