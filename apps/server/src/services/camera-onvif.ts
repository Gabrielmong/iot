import { isIPv4 } from "node:net";
import { badInput, notFound } from "../api-errors.js";
import type { Device } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { deviceRow, type DeviceRow } from "./device-rows.js";
import { findOnvifStream } from "./onvif-local-stream.js";
import { checkAddressConfirmation, confirmCameraAt } from "./onvif-presence.js";
import { clearCameraOnvifStore, saveCameraOnvif } from "./onvif-store.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "manager" | "secretKey" | "onvifProbe" | "rtspDescribe" | "tuyaPresence" | "cameraEvents">;

/**
 * Switches a Tuya camera to its local stream: checks the admin confirmed its address (required on
 * Tuya 3.1/3.3), confirms the real camera is at that IPv4 address (local-key session), finds the stream over ONVIF there, verifies it with the same login, then stores it (login encrypted) and sets LOCAL. On any failure
 * nothing is stored. Current viewers are moved to the new source. Errors never include the password.
 */
export async function setCameraOnvif(deps: Deps, input: { deviceId: string; username: string; password: string; confirmAddress?: string | null }): Promise<DeviceRow> {
  const username = input.username.trim();
  if (!username) throw badInput("Username is required");
  if (!input.password) throw badInput("Password is required");
  const device = await tuyaCamera(deps, input.deviceId);
  if (!device.ip || !isIPv4(device.ip)) throw badInput("The camera has no IPv4 address yet");

  checkAddressConfirmation(device, device.ip, input.confirmAddress);
  await confirmCameraAt(deps, device, device.ip);
  const creds = { username, password: input.password };
  const onvif = await findOnvifStream(deps, device.ip, creds);
  await saveCameraOnvif(deps, device.id, onvif, creds);
  return announce(deps, device.id);
}

/** Forgets the camera's local stream and login and switches it back to the Tuya cloud. */
export async function clearCameraOnvif(deps: Deps, deviceId: string): Promise<DeviceRow> {
  const device = await tuyaCamera(deps, deviceId);
  await clearCameraOnvifStore(deps, device.id);
  return announce(deps, device.id);
}

async function tuyaCamera(deps: Pick<ServiceDeps, "prisma">, id: string): Promise<Device> {
  const device = await deps.prisma.device.findUnique({ where: { id } });
  if (!device) throw notFound("Device");
  if (device.brand !== "TUYA" || device.kind !== "CAMERA") throw badInput("Only Tuya cameras can stream locally over ONVIF");
  return device;
}

async function announce(deps: Deps, id: string): Promise<DeviceRow> {
  await publishDevicesChanged(deps.pubsub);
  deps.cameraEvents.emit("sourceChanged", id);
  const row = await deviceRow(deps.prisma, id);
  if (!row) throw notFound("Device");
  return row;
}
