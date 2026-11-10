import { NIGHT_VISION_VALUES, PTZ_VALUES, type CameraControlCode, type CameraFeatures, type NightVisionMode, type PanDirection } from "@home/protocols";
import { badInput } from "../../api-errors.js";

export type CameraSettingsPatch = {
  nightVision?: NightVisionMode;
  privacy?: boolean;
  flip?: boolean;
  followMotion?: boolean;
  timestamp?: boolean;
  statusLight?: boolean;
  motionDetection?: boolean;
  wdr?: boolean;
};
export type CameraSetting = keyof CameraSettingsPatch;
export type CameraSettingsValues = { [K in CameraSetting]-?: NonNullable<CameraSettingsPatch[K]> | null };

/** Setting → Tuya code, in display order. */
export const SETTING_CODES: Record<CameraSetting, CameraControlCode> = {
  nightVision: "basic_nightvision",
  privacy: "basic_private",
  flip: "basic_flip",
  followMotion: "motion_tracking",
  timestamp: "basic_osd",
  statusLight: "basic_indicator",
  motionDetection: "motion_switch",
  wdr: "basic_wdr",
};
const SETTINGS = Object.keys(SETTING_CODES) as CameraSetting[];

export const STOP_PROPS = { ptz_stop: true } as const;

export function moveProps(direction: PanDirection): Record<string, unknown> {
  return { ptz_control: PTZ_VALUES[direction] };
}

/** The shadow properties for a settings change. Throws BAD_USER_INPUT for an empty patch or a setting the camera lacks. */
export function settingsToProps(patch: CameraSettingsPatch, features: CameraFeatures): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const setting of SETTINGS) {
    const value = patch[setting];
    if (value === undefined || value === null) continue;
    const code = SETTING_CODES[setting];
    if (!features[code]) throw badInput("This camera can't do that");
    props[code] = setting === "nightVision" ? NIGHT_VISION_VALUES[value as NightVisionMode] : value;
  }
  if (Object.keys(props).length === 0) throw badInput("Nothing to change");
  return props;
}

const NIGHT_VISION_BY_VALUE = new Map<string, NightVisionMode>(Object.entries(NIGHT_VISION_VALUES).map(([mode, v]) => [v, mode as NightVisionMode]));

/** Current setting values from the shadow; null where unsupported or the value is unexpected. */
export function settingsFromValues(values: Record<string, unknown>, features: CameraFeatures): CameraSettingsValues {
  const read = (setting: CameraSetting) => {
    const code = SETTING_CODES[setting];
    if (!features[code]) return null;
    const v = values[code];
    if (setting === "nightVision") return (typeof v === "string" && NIGHT_VISION_BY_VALUE.get(v)) || null;
    return typeof v === "boolean" ? v : null;
  };
  return Object.fromEntries(SETTINGS.map((s) => [s, read(s)])) as CameraSettingsValues;
}

/** The settings the camera has; privacy only for admins (only they may change it). */
export function supportedSettings(features: CameraFeatures, isAdmin: boolean): CameraSetting[] {
  return SETTINGS.filter((s) => features[SETTING_CODES[s]] && (isAdmin || s !== "privacy"));
}
