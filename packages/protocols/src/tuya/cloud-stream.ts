import { TuyaCloudStreamUnavailableError } from './cloud-errors.js';
import type { CloudHttp } from './cloud-http.js';
import { isSafeCloudStreamUrl } from './cloud-stream-url.js';

/** Stream protocols the allocate endpoint is asked for. */
export type CloudStreamType = 'rtsp' | 'hls';

/** A temporary stream URL from the Tuya cloud. The URL is bearer-like: never log or return it. */
export type CloudStream = { url: string; expiresInSec: number };

/** Used when the reply does not say how long the URL lives. */
export const DEFAULT_STREAM_EXPIRY_SEC = 300;
/** A stated lifetime is clamped to this range, so a bad reply cannot pass on a nonsensical value. */
export const MIN_STREAM_EXPIRY_SEC = 30;
export const MAX_STREAM_EXPIRY_SEC = 3600;

type AllocateReply = { url?: unknown; expire_time?: unknown };

/**
 * Asks the Tuya OpenAPI ("IoT Video Live Stream" service) for a camera's temporary stream URL.
 * Any failure, including a reply without a URL or with one unsafe for go2rtc (wrong protocol for
 * `type`, a `#`, whitespace or control characters), is a TuyaCloudStreamUnavailableError.
 */
export async function allocateCloudStream(http: Pick<CloudHttp, 'post'>, deviceId: string, type: CloudStreamType): Promise<CloudStream> {
  let reply: AllocateReply | undefined;
  try {
    reply = await http.post<AllocateReply | undefined>(`/v1.0/devices/${encodeURIComponent(deviceId)}/stream/actions/allocate`, { type });
  } catch (err) {
    throw new TuyaCloudStreamUnavailableError({ cause: err });
  }
  return mapAllocateReply(reply, type);
}

function mapAllocateReply(reply: AllocateReply | undefined, type: CloudStreamType): CloudStream {
  if (typeof reply?.url !== 'string' || !isSafeCloudStreamUrl(reply.url, type)) throw new TuyaCloudStreamUnavailableError();
  const expiry = reply.expire_time;
  const stated = typeof expiry === 'number' && Number.isFinite(expiry) && expiry > 0 ? expiry : DEFAULT_STREAM_EXPIRY_SEC;
  return { url: reply.url, expiresInSec: Math.min(MAX_STREAM_EXPIRY_SEC, Math.max(MIN_STREAM_EXPIRY_SEC, stated)) };
}
