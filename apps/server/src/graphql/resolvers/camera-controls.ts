import type { PanDirection } from "@home/protocols";
import type { CameraSettingsPatch } from "../../cameras/controls/commands.js";
import { getCameraControls, gotoPreset, moveCamera, savePreset, setCameraSettings, stopCamera } from "../../cameras/controls/control-service.js";
import type { ApiContext } from "../context.js";
import { requireUser } from "../guards.js";

type Target = { deviceId: string };

export const cameraControlResolvers = {
  Query: {
    cameraControls: (_: unknown, { deviceId }: Target, ctx: ApiContext) => getCameraControls(ctx.deps, requireUser(ctx), deviceId),
  },
  Mutation: {
    moveCamera: async (_: unknown, { deviceId, direction }: Target & { direction: PanDirection }, ctx: ApiContext) => {
      await moveCamera(ctx.deps, requireUser(ctx), deviceId, direction);
      return true;
    },
    stopCamera: async (_: unknown, { deviceId }: Target, ctx: ApiContext) => {
      await stopCamera(ctx.deps, requireUser(ctx), deviceId);
      return true;
    },
    gotoCameraPreset: async (_: unknown, { deviceId, slot }: Target & { slot: number }, ctx: ApiContext) => {
      await gotoPreset(ctx.deps, requireUser(ctx), deviceId, slot);
      return true;
    },
    saveCameraPreset: (_: unknown, { deviceId, slot }: Target & { slot: number }, ctx: ApiContext) => savePreset(ctx.deps, requireUser(ctx), deviceId, slot),
    setCameraSettings: (_: unknown, { deviceId, settings }: Target & { settings: CameraSettingsPatch }, ctx: ApiContext) =>
      setCameraSettings(ctx.deps, requireUser(ctx), deviceId, settings),
  },
};
