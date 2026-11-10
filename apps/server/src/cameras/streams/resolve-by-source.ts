import type { DeviceRecord, StreamSource } from "../../devices/types.js";
import type { StreamResolver } from "./types.js";

/**
 * Picks a camera's resolver by its stream source: CLOUD cameras go to the cloud, and so do Tuya
 * cameras with no source yet (discovered after the last Tuya sync, which sets it). The rest stay local.
 */
export function resolveBySource(resolvers: Record<StreamSource, StreamResolver>): StreamResolver {
  return (device) => resolvers[sourceOf(device)](device);
}

function sourceOf(device: DeviceRecord): StreamSource {
  if (device.streamSource) return device.streamSource;
  return device.brand === "TUYA" && device.kind === "CAMERA" ? "CLOUD" : "LOCAL";
}
