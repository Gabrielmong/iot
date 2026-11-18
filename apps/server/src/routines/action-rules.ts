import { badInput } from "../api-errors.js";
import type { Brand, DeviceKind } from "../generated/prisma/client.js";
import type { DeviceAction } from "./steps.js";

type DeviceInfo = { kind: DeviceKind; brand: Brand };
/** hasAgent: the PC runs HomeAgent, so it can be put to sleep or shut down. */
type SaveInfo = DeviceInfo & { hasAgent: boolean };

const SWITCHABLE = new Set<DeviceKind>(["LIGHT", "SWITCH", "PLUG", "TV", "COMPUTER"]);
const FULL_LIGHT_BRANDS = new Set<Brand>(["GOVEE", "TUYA"]);

/** Govee and Tuya lights take brightness, color and white temperature; everything else only on/off. */
export const supportsLightDetails = (d: DeviceInfo) => d.kind === "LIGHT" && FULL_LIGHT_BRANDS.has(d.brand);

/** Lights, switches, plugs, TVs and computers; not a power strip whose outlets are shown on their own. */
export const canUseInRoutine = (d: DeviceInfo & { hasAdoptedChildren: boolean }) => SWITCHABLE.has(d.kind) && !d.hasAdoptedChildren;

const hasDetails = (a: DeviceAction) => a.brightness !== undefined || a.color !== undefined || a.colorTempK !== undefined;

/** Save-time check: throws BAD_USER_INPUT naming the device when the action asks for more than it supports. */
export function assertActionFits(action: DeviceAction, d: SaveInfo, deviceName: string): void {
  if (action.pcPower) {
    if (d.kind !== "COMPUTER") throw badInput(`${deviceName} can't sleep or shut down`);
    if (!d.hasAgent) throw badInput(`${deviceName} has no agent`);
    return;
  }
  if (supportsLightDetails(d)) return;
  if (d.kind === "COMPUTER" && (action.on !== true || hasDetails(action))) throw badInput(`${deviceName} can only be woken`);
  if (action.on === undefined || hasDetails(action)) throw badInput(`${deviceName} can only be switched on or off`);
}

/** Run-time: the action trimmed to what the device supports now, or null when nothing is left. */
export function fitAction(action: DeviceAction, d: DeviceInfo): DeviceAction | null {
  if (!SWITCHABLE.has(d.kind)) return null;
  if (action.pcPower) return d.kind === "COMPUTER" ? action : null;
  if (supportsLightDetails(d)) return action;
  if (d.kind === "COMPUTER" && action.on !== true) return null;
  return action.on === undefined ? null : { deviceId: action.deviceId, on: action.on };
}
