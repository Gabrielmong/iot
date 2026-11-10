import { isCloudAccountRefusal, isSafeCloudStreamUrl, TuyaCloudStreamUnavailableError, type CloudStream, type CloudStreamType } from "@home/protocols";

/** Asks the Tuya cloud for a camera's temporary stream URL (by its Tuya id). Throws TuyaCloudStreamUnavailableError. */
export type StreamAllocator = (tuyaId: string, type: CloudStreamType) => Promise<CloudStream>;

/**
 * The go2rtc source for a cloud URL. RTSP(S) is played natively (go2rtc 1.9.15 registers `rtsps`
 * and verifies TLS against the host name); these cameras send H.264 + G.711, which WebRTC carries
 * as is. HLS carries AAC, which WebRTC cannot: it is read through ffmpeg, video copied, audio to Opus.
 */
export function cloudGo2rtcSource(type: CloudStreamType, url: string): string {
  return type === "rtsp" ? url : `ffmpeg:${url}#video=copy#audio=opus`;
}

/**
 * Allocates RTSP, else HLS, and returns the go2rtc source. HLS is not tried when RTSP was refused for
 * the account (credentials, subscription): another type cannot help. Each URL is checked again before
 * it becomes (part of) a go2rtc source: no other scheme, no `#modifier`. Throws TuyaCloudStreamUnavailableError.
 */
export async function allocateCloudSource(allocate: StreamAllocator, tuyaId: string): Promise<string> {
  try {
    return cloudGo2rtcSource("rtsp", await safeAllocate(allocate, tuyaId, "rtsp"));
  } catch (err) {
    if (isCloudAccountRefusal(err)) throw unavailable(err);
  }
  try {
    return cloudGo2rtcSource("hls", await safeAllocate(allocate, tuyaId, "hls"));
  } catch (err) {
    throw unavailable(err);
  }
}

async function safeAllocate(allocate: StreamAllocator, tuyaId: string, type: CloudStreamType): Promise<string> {
  const { url } = await allocate(tuyaId, type);
  if (!isSafeCloudStreamUrl(url, type)) throw new TuyaCloudStreamUnavailableError();
  return url;
}

function unavailable(err: unknown): TuyaCloudStreamUnavailableError {
  return err instanceof TuyaCloudStreamUnavailableError ? err : new TuyaCloudStreamUnavailableError({ cause: err });
}
