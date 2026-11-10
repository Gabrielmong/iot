import { tuyaVersionOf } from "../devices/drivers/tuya-target.js";
import type { TuyaVersion } from "@home/protocols";
import { badInput } from "../api-errors.js";
import type { Device } from "../generated/prisma/client.js";
import { decryptSecret } from "../secrets.js";
import type { ServiceDeps } from "./deps.js";
import { onvifCameraNotConfirmed } from "./onvif-errors.js";

/** 3.3's local-key session has no fresh client nonce, so a captured status reply can be replayed. */
const REPLAYABLE: readonly TuyaVersion[] = ["3.3"];

/**
 * Whether the camera's address can be trusted, and the admin's confirmation of it: Tuya 3.1 is refused
 * (its status replies are plaintext, so they prove nothing); a given confirmation must equal `ip`; on
 * 3.3 it is required, since the presence proof alone could be replayed. Throws BAD_USER_INPUT.
 */
export function checkAddressConfirmation(device: Device, ip: string, confirmAddress: string | null | undefined): void {
  if (tuyaVersionOf(device.config) === "3.1") {
    throw badInput("Tuya 3.1 cameras can't prove their address securely, so they can't stream locally over ONVIF.");
  }
  const confirmed = confirmAddress?.trim();
  if (confirmed !== undefined && confirmed !== "" && confirmed !== ip) throw badInput("The camera's address has changed. Check it and confirm again.");
  if (!confirmed && REPLAYABLE.includes(tuyaVersionOf(device.config))) throw badInput("Confirm the camera's address first.");
}

/**
 * Proves the real camera is at `ip` before the admin's login is sent there: its Tuya status is OK (it
 * has a working local key) and a local-key session to that IP succeeds now. A device's IP comes from
 * unauthenticated LAN broadcasts, so without this a spoofer could collect the login. Throws ONVIF_CAMERA_NOT_CONFIRMED.
 */
export async function confirmCameraAt(deps: Pick<ServiceDeps, "secretKey" | "tuyaPresence">, device: Device, ip: string): Promise<void> {
  if (device.status !== "OK" || !device.secret) throw onvifCameraNotConfirmed();
  let localKey: string;
  try {
    localKey = decryptSecret(device.secret, deps.secretKey);
  } catch {
    throw onvifCameraNotConfirmed();
  }
  const present = await deps.tuyaPresence({ ip, externalId: device.externalId, localKey, version: tuyaVersionOf(device.config) });
  if (!present) throw onvifCameraNotConfirmed();
}
