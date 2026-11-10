import { PRESET_COMMANDS, type CameraFeatures, type PanDirection } from "@home/protocols";
import { badInput, forbidden, notFound } from "../../api-errors.js";
import type { User } from "../../generated/prisma/client.js";
import type { ServiceDeps } from "../../services/deps.js";
import type { DeviceRow } from "../../services/device-rows.js";
import { tuyaCloudApiError } from "../../services/tuya-cloud-errors.js";
import { visibleCamera } from "../camera-access.js";
import { cameraCloud } from "./cloud-client.js";
import {
  settingsFromValues,
  settingsToProps,
  supportedSettings,
  type CameraSetting,
  type CameraSettingsPatch,
  type CameraSettingsValues,
} from "./commands.js";
import { cameraFeaturesOf } from "./features.js";
import { motionFor } from "./motion.js";
import { checkSlot, hasPresets, markSlotSaved, presetSlots, type PresetSlot } from "./presets.js";

export type ControlDeps = Pick<ServiceDeps, "prisma" | "secretKey" | "tuyaCloud" | "manager" | "log">;
type Caller = Pick<User, "id" | "role">;

export type CameraControlsView = {
  deviceId: string;
  pan: boolean;
  presets: PresetSlot[] | null;
  supported: CameraSetting[];
  /** null when the camera's values could not be read. */
  settings: CameraSettingsValues | null;
};

type Target = { row: DeviceRow; features: CameraFeatures };

/** The camera if the caller may see it and it has known features. */
async function target(deps: ControlDeps, user: Caller, deviceId: string): Promise<Target> {
  const row = await visibleCamera(deps, user, deviceId);
  if (!row || row.brand !== "TUYA") throw notFound("Camera");
  const features = cameraFeaturesOf(row.config);
  if (!features) throw badInput("This camera can't do that");
  return { row, features };
}

async function issue(deps: ControlDeps, row: DeviceRow, props: Record<string, unknown>): Promise<void> {
  const cloud = await cameraCloud(deps);
  try {
    await cloud.issueCameraProperties(row.externalId, props);
  } catch (err) {
    throw tuyaCloudApiError(err);
  }
}

/** The camera as the motion queue sees it. */
const camera = (deps: ControlDeps, row: DeviceRow) => ({ id: row.id, issue: (p: Record<string, unknown>) => issue(deps, row, p) });

function needPan(features: CameraFeatures): void {
  if (!features.ptz_control || !features.ptz_stop) throw badInput("This camera can't do that");
}

function needPresets(features: CameraFeatures): void {
  if (!hasPresets(features)) throw badInput("This camera can't do that");
}

/** What the caller can control on the camera, with current values; null when none (or not a visible camera). */
export async function getCameraControls(deps: ControlDeps, user: Caller, deviceId: string): Promise<CameraControlsView | null> {
  const row = await visibleCamera(deps, user, deviceId);
  const features = row?.brand === "TUYA" ? cameraFeaturesOf(row.config) : undefined;
  if (!row || !features) return null;
  return view(deps, user, { row, features });
}

/** `changed`: settings just sent, shown as they will be (the camera reports a change a moment after it). */
async function view(deps: ControlDeps, user: Caller, { row, features }: Target, changed: CameraSettingsPatch = {}): Promise<CameraControlsView> {
  let settings: CameraSettingsValues | null = null;
  try {
    settings = settingsFromValues(await (await cameraCloud(deps)).readCameraValues(row.externalId), features);
  } catch (err) {
    deps.log.warn(`camera-controls: cannot read values of camera ${row.id}: ${err instanceof Error ? err.name : "error"}`);
  }
  if (settings) {
    for (const [k, v] of Object.entries(changed)) if (v !== undefined && v !== null) (settings as Record<string, unknown>)[k] = v;
  }
  return {
    deviceId: row.id,
    pan: Boolean(features.ptz_control && features.ptz_stop),
    presets: hasPresets(features) ? presetSlots(row.config) : null,
    supported: supportedSettings(features, user.role === "ADMIN"),
    settings,
  };
}

/** Starts (or keeps) the camera moving; repeat while held, or the safety stop ends it. */
export async function moveCamera(deps: ControlDeps, user: Caller, deviceId: string, direction: PanDirection): Promise<void> {
  const t = await target(deps, user, deviceId);
  needPan(t.features);
  await motionFor(deps).move(camera(deps, t.row), direction);
}

export async function stopCamera(deps: ControlDeps, user: Caller, deviceId: string): Promise<void> {
  const t = await target(deps, user, deviceId);
  needPan(t.features);
  await motionFor(deps).stop(camera(deps, t.row));
}

export async function gotoPreset(deps: ControlDeps, user: Caller, deviceId: string, slot: number): Promise<void> {
  checkSlot(slot);
  const t = await target(deps, user, deviceId);
  needPresets(t.features);
  await issue(deps, t.row, PRESET_COMMANDS.goto(slot));
}

export async function savePreset(deps: ControlDeps, user: Caller, deviceId: string, slot: number): Promise<CameraControlsView> {
  checkSlot(slot);
  const t = await target(deps, user, deviceId);
  needPresets(t.features);
  await issue(deps, t.row, PRESET_COMMANDS.save(slot));
  await markSlotSaved(deps, t.row.id, slot);
  return view(deps, user, await target(deps, user, deviceId));
}

/** Changes settings; privacy is admin-only. */
export async function setCameraSettings(deps: ControlDeps, user: Caller, deviceId: string, patch: CameraSettingsPatch): Promise<CameraControlsView> {
  const t = await target(deps, user, deviceId);
  if (patch.privacy !== undefined && patch.privacy !== null && user.role !== "ADMIN") throw forbidden("Only an admin can change privacy mode");
  await issue(deps, t.row, settingsToProps(patch, t.features));
  return view(deps, user, t, patch);
}
