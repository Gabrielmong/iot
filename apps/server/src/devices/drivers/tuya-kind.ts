import type { DeviceKind } from "../types.js";

const KIND_BY_CATEGORY: Record<string, DeviceKind> = {
  dj: "LIGHT",
  dd: "LIGHT",
  fwd: "LIGHT",
  kg: "SWITCH",
  tdq: "SWITCH",
  cz: "PLUG",
  pc: "PLUG",
  sp: "CAMERA",
  cdsxj: "CAMERA",
};

/** Device kind for a Tuya cloud category. Cameras are recorded but not controlled in Phase 1. */
export function tuyaKindFromCategory(category: string): DeviceKind {
  return KIND_BY_CATEGORY[category] ?? "UNKNOWN";
}

/** Tuya cameras stream via the Tuya cloud by default (an admin may switch one to a local ONVIF stream). */
export function isTuyaCloudCamera(category: string | undefined): boolean {
  return category === "sp";
}
