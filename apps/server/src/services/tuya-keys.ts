import type { CameraFeatures, DpSchema } from "@home/protocols";
import { badInput, notFound } from "../api-errors.js";
import { isTuyaCloudCamera } from "../devices/drivers/tuya-kind.js";
import type { DeviceManager } from "../devices/manager.js";
import type { Device, DeviceKind, Prisma } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import { asObject } from "../json.js";
import { encryptSecret } from "../secrets.js";
import type { ServiceDeps } from "./deps.js";
import { deviceRow, type DeviceRow } from "./device-rows.js";
import { raisedTuyaVersion } from "./tuya-version.js";

/** What the cloud tells us about a Tuya device besides its key. */
export type TuyaKeyExtras = { kind?: DeviceKind; dpSchema?: DpSchema; category?: string; name?: string; cameraFeatures?: CameraFeatures };

/**
 * The update that stores a local key (encrypted) on a Tuya device: status OK, or NEEDS_KEY for an
 * empty key. The protocol version may move up to the one last seen on the LAN, never down. The
 * cloud's kind and name only fill in what the admin has not chosen (unadopted, or kind UNKNOWN). A
 * camera (category `sp`) without a stream source is set to stream via the cloud; a chosen one stays.
 */
export function tuyaKeyUpdate(
  device: Device,
  localKey: string,
  manager: Pick<DeviceManager, "observedConfig">,
  secretKey: Buffer,
  extras: TuyaKeyExtras = {},
): Prisma.DeviceUpdateInput {
  const config = asObject(device.config);
  const version = raisedTuyaVersion(config.version, manager.observedConfig("TUYA", device.externalId)?.version);
  const kindIsOpen = !device.adopted || device.kind === "UNKNOWN";
  return {
    secret: localKey ? encryptSecret(localKey, secretKey) : null,
    status: localKey ? "OK" : "NEEDS_KEY",
    ...(kindIsOpen && extras.kind && extras.kind !== "UNKNOWN" ? { kind: extras.kind } : {}),
    ...(!device.adopted && extras.name ? { name: extras.name } : {}),
    ...(device.streamSource === null && isTuyaCloudCamera(extras.category) ? { streamSource: "CLOUD" as const } : {}),
    config: {
      ...config,
      ...(version ? { version } : {}),
      ...(extras.dpSchema ? { dpSchema: extras.dpSchema } : {}),
      ...(extras.category ? { category: extras.category } : {}),
      ...(extras.cameraFeatures ? { cameraFeatures: extras.cameraFeatures } : {}),
    } as Prisma.InputJsonObject,
  };
}

/**
 * Applies a key to the matching Tuya device, reading and writing it inside the device manager's
 * write queue. Returns the updated device; null when none matches; a non-Tuya device unchanged.
 */
export function applyTuyaKey(
  deps: Pick<ServiceDeps, "prisma" | "manager" | "secretKey">,
  where: Prisma.DeviceWhereUniqueInput,
  localKey: string,
  extras?: TuyaKeyExtras,
): Promise<Device | null> {
  return deps.manager.runDeviceWrite(async () => {
    const device = await deps.prisma.device.findUnique({ where });
    if (!device || device.brand !== "TUYA") return device;
    return deps.prisma.device.update({ where: { id: device.id }, data: tuyaKeyUpdate(device, localKey, deps.manager, deps.secretKey, extras) });
  });
}

/** Sets a Tuya device's local key by hand, then re-syncs the drivers. */
export async function setTuyaLocalKey(
  deps: Pick<ServiceDeps, "prisma" | "pubsub" | "manager" | "secretKey">,
  deviceId: string,
  localKey: string,
): Promise<DeviceRow> {
  const key = localKey.trim();
  if (!key) throw badInput("Local key is required");
  const device = await applyTuyaKey(deps, { id: deviceId }, key);
  if (!device) throw notFound("Device");
  if (device.brand !== "TUYA") throw badInput("Only Tuya devices take a local key");
  await deps.manager.refresh();
  await publishDevicesChanged(deps.pubsub);
  const row = await deviceRow(deps.prisma, deviceId);
  if (!row) throw notFound("Device");
  return row;
}
