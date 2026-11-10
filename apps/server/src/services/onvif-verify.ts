import { RtspAuthUnsupportedError, sdpVideoCodec, type RtspCredentials, type VideoCodec } from "@home/protocols";
import type { ServiceDeps } from "./deps.js";
import { onvifAuthFailed, onvifNoStream, onvifUnreachable } from "./onvif-errors.js";

/**
 * DESCRIBEs the stream (Digest login; Basic is refused) and returns its video codec. Throws
 * ONVIF_AUTH_FAILED on a 401, ONVIF_NO_STREAM for any other status, a Basic-only server or no video,
 * and ONVIF_UNREACHABLE when the RTSP server does not answer. `url` carries no login.
 */
export async function verifyOnvifStream(deps: Pick<ServiceDeps, "rtspDescribe">, url: string, creds: RtspCredentials): Promise<VideoCodec> {
  let result;
  try {
    result = await deps.rtspDescribe(url, creds);
  } catch (e) {
    throw e instanceof RtspAuthUnsupportedError ? onvifNoStream() : onvifUnreachable();
  }
  if (result.status === 401) throw onvifAuthFailed();
  const codec = result.status === 200 && result.sdp !== undefined ? sdpVideoCodec(result.sdp) : undefined;
  if (!codec) throw onvifNoStream();
  return codec;
}
