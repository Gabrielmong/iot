import type { GoveeDeviceInfo, LightState, Rgb } from "@home/protocols";
import type { Discovered, StatePatch } from "../types.js";

export type GoveeCommand =
  | { type: "on"; on: boolean }
  | { type: "brightness"; pct: number }
  | { type: "color"; rgb: Rgb }
  | { type: "colorTemp"; kelvin: number };

export function goveeToDiscovered(info: GoveeDeviceInfo): Discovered {
  return { brand: "GOVEE", externalId: info.device, ip: info.ip, model: info.sku, kind: "LIGHT" };
}

/** Commands for a patch: turning on goes first and turning off last, so other changes are not lost. Colour wins over temperature. */
export function goveeCommands(patch: StatePatch): GoveeCommand[] {
  const cmds: GoveeCommand[] = [];
  if (patch.on === true) cmds.push({ type: "on", on: true });
  if (patch.color) cmds.push({ type: "color", rgb: patch.color });
  else if (patch.colorTempK !== undefined) cmds.push({ type: "colorTemp", kelvin: patch.colorTempK });
  if (patch.brightness !== undefined) cmds.push({ type: "brightness", pct: patch.brightness });
  if (patch.on === false) cmds.push({ type: "on", on: false });
  return cmds;
}

/** The light state expected after a patch (Govee commands are not acknowledged). */
export function applyPatch(light: LightState, patch: StatePatch): LightState {
  const next: LightState = { ...light };
  if (patch.on !== undefined) next.on = patch.on;
  if (patch.brightness !== undefined) next.brightness = patch.brightness;
  if (patch.color) {
    next.mode = "color";
    next.color = patch.color;
    delete next.colorTempK;
  } else if (patch.colorTempK !== undefined) {
    next.mode = "white";
    next.colorTempK = patch.colorTempK;
    delete next.color;
  }
  return next;
}
