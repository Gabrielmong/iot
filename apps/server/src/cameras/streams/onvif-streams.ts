import type { RtspCredentials } from "@home/protocols";
import { onvifCameraConfig } from "../../devices/onvif-config.js";
import type { StreamLoginCheck } from "./digest-guard.js";
import { CameraUnavailableError } from "./errors.js";
import { goSource, rtspSourceUrl, rtspUrl } from "./source-url.js";
import type { StreamResolver } from "./types.js";

/**
 * Builds a LOCAL Tuya camera's sources from its verified ONVIF stream (`config.onvif`) and its stored
 * login. The host is the one verified when ONVIF was set up, not the latest LAN sighting, so a spoofed
 * broadcast cannot redirect the login. The main stream must pass the Digest-only login check first.
 * Sources carry the login: never log them.
 */
export function onvifStreamResolver(credentials: (deviceId: string) => Promise<RtspCredentials | undefined>, guard: StreamLoginCheck): StreamResolver {
  return async (device) => {
    if (device.brand !== "TUYA") throw new CameraUnavailableError(`no ONVIF streams for ${device.brand} devices`);
    const onvif = onvifCameraConfig(device.config);
    if (!onvif) throw new CameraUnavailableError("camera has no local stream config");
    const creds = await credentials(device.id);
    if (!creds) throw new CameraUnavailableError("camera login is not configured");
    await guard.check(device.id, rtspUrl(onvif.host, onvif.mainPath, onvif.port), creds);
    const src = (path: string) => goSource(rtspSourceUrl(onvif.host, creds, path, onvif.port), onvif.codec);
    return { live: src(onvif.mainPath), ...(onvif.subPath ? { sub: src(onvif.subPath) } : {}) };
  };
}
