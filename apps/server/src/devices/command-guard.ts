import { badInput } from "../api-errors.js";
import type { Device } from "../generated/prisma/client.js";
import type { StatePatch } from "./types.js";

const CONTROLLABLE = new Set<Device["kind"]>(["LIGHT", "SWITCH", "PLUG", "TV", "COMPUTER"]);

/** Throws BAD_USER_INPUT when the patch asks for something the device can never do. */
export function assertPatchFits(device: Pick<Device, "kind">, patch: StatePatch): void {
  if (device.kind === "COMPUTER" && patch.on === false) throw badInput("Computers can only be woken, not turned off");
}

/** Why a device cannot take commands, or undefined when it can. */
export function notReadyReason(device: Device): string | undefined {
  if (!device.adopted) return "not adopted";
  if (!CONTROLLABLE.has(device.kind)) return `${device.kind.toLowerCase()} devices are not controlled`;
  if (device.status !== "OK") return device.status;
  return undefined;
}
