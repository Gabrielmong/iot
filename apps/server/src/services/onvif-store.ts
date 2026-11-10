import type { RtspCredentials } from "@home/protocols";
import { notFound } from "../api-errors.js";
import type { OnvifCameraConfig } from "../devices/onvif-config.js";
import { serializeCredentials } from "../devices/onvif-credentials.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { asObject } from "../json.js";
import { encryptSecret } from "../secrets.js";
import { SettingKey } from "../settings-keys.js";
import type { ServiceDeps } from "./deps.js";

type Deps = Pick<ServiceDeps, "prisma" | "manager" | "secretKey">;

/** Stores the verified stream in `config.onvif`, the login encrypted, and switches the camera to LOCAL, all at once. */
export function saveCameraOnvif(deps: Deps, deviceId: string, onvif: OnvifCameraConfig, creds: RtspCredentials): Promise<void> {
  const key = SettingKey.cameraOnvif(deviceId);
  const value = encryptSecret(serializeCredentials(creds), deps.secretKey);
  return updateConfig(deps, deviceId, (config) => ({ ...config, onvif }), "LOCAL", [
    deps.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
  ]);
}

/** Deletes the login and `config.onvif` and switches the camera back to CLOUD, all at once. */
export function clearCameraOnvifStore(deps: Deps, deviceId: string): Promise<void> {
  return updateConfig(deps, deviceId, ({ onvif: _, ...rest }) => rest, "CLOUD", [deleteCameraOnvifLogin(deps.prisma, deviceId)]);
}

/** Deletes the camera's stored ONVIF login (device removal does this in deleteDeviceTree). */
function deleteCameraOnvifLogin(prisma: PrismaClient, deviceId: string) {
  return prisma.setting.deleteMany({ where: { key: SettingKey.cameraOnvif(deviceId) } });
}

/** Read-modify-write of the device's config inside the manager's write queue (so a Tuya sync cannot interleave). */
function updateConfig(
  deps: Deps,
  deviceId: string,
  change: (config: Record<string, unknown>) => Record<string, unknown>,
  streamSource: "LOCAL" | "CLOUD",
  alongside: Prisma.PrismaPromise<unknown>[],
): Promise<void> {
  return deps.manager.runDeviceWrite(async () => {
    const device = await deps.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw notFound("Device");
    const config = change(asObject(device.config)) as Prisma.InputJsonObject;
    await deps.prisma.$transaction([...alongside, deps.prisma.device.update({ where: { id: deviceId }, data: { config, streamSource } })]);
  });
}
