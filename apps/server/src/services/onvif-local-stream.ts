import type { RtspCredentials } from "@home/protocols";
import type { OnvifCameraConfig } from "../devices/onvif-config.js";
import type { ServiceDeps } from "./deps.js";
import { onvifNoStream, onvifProbeError } from "./onvif-errors.js";
import { onvifRtspTarget } from "./onvif-rtsp-target.js";
import { verifyOnvifStream } from "./onvif-verify.js";

/**
 * Finds the camera's local stream over ONVIF at `ip` and verifies its main URI with DESCRIBE (same
 * login, Digest). URIs on another host are refused: the main one fails with ONVIF_NO_STREAM, a sub one
 * is dropped (as is a sub on another port, since one RTSP port is stored). Throws ONVIF_AUTH_FAILED / ONVIF_UNREACHABLE / ONVIF_NO_STREAM; nothing is stored here.
 */
export async function findOnvifStream(deps: Pick<ServiceDeps, "onvifProbe" | "rtspDescribe">, ip: string, creds: RtspCredentials): Promise<OnvifCameraConfig> {
  let found;
  try {
    found = await deps.onvifProbe(ip, creds);
  } catch (e) {
    throw onvifProbeError(e);
  }
  const main = onvifRtspTarget(found.main, ip);
  if (!main) throw onvifNoStream();
  const sub = found.sub === undefined ? undefined : onvifRtspTarget(found.sub, ip);
  const codec = await verifyOnvifStream(deps, `rtsp://${ip}:${main.port}${main.path}`, creds);
  return { host: ip, port: main.port, mainPath: main.path, ...(sub && sub.port === main.port ? { subPath: sub.path } : {}), codec };
}
