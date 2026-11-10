import { swannCameraConfig } from "../../devices/drivers/swann-mapping.js";
import type { SwannConnection } from "../../devices/swann-settings.js";
import type { StreamLoginCheck } from "./digest-guard.js";
import { CameraUnavailableError } from "./errors.js";
import { goSource, rtspSourceUrl, rtspUrl } from "./source-url.js";
import type { StreamResolver } from "./types.js";

/** Builds a Swann camera's sources from its stream config and the stored recorder login, once the main stream passes the Digest-only login check. */
export function swannStreamResolver(connection: () => Promise<SwannConnection | undefined>, guard: StreamLoginCheck): StreamResolver {
  return async (device) => {
    if (device.brand !== "SWANN") throw new CameraUnavailableError(`no local streams for ${device.brand} devices`);
    const channel = swannCameraConfig(device.config);
    if (!channel) throw new CameraUnavailableError("camera has no stream config");
    const conn = await connection();
    if (!conn) throw new CameraUnavailableError("recorder login is not configured");
    await guard.check(device.id, rtspUrl(conn.host, channel.mainPath), conn.creds);
    const src = (path: string) => goSource(rtspSourceUrl(conn.host, conn.creds, path), channel.codec);
    return { live: src(channel.mainPath), ...(channel.subPath ? { sub: src(channel.subPath) } : {}) };
  };
}
