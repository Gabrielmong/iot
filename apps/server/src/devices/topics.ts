import type { RunSnapshot } from "../routines/run-outcome.js";
import type { DeviceState } from "./types.js";

export const DEVICE_STATE = "DEVICE_STATE";
export const DEVICES_CHANGED = "DEVICES_CHANGED";
export const ROUTINES_CHANGED = "ROUTINES_CHANGED";
export const ROUTINE_RUN = "ROUTINE_RUN";
export const CAMERA_GROUPS_CHANGED = "CAMERA_GROUPS_CHANGED";

export type DeviceStatePayload = { deviceId: string; state: DeviceState };
/** key: a routine id, or "try:<userId>" for a draft run. */
export type RoutineRunPayload = { key: string; run: RunSnapshot };
export type DevicesChangedPayload = Record<string, never>;
