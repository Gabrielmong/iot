/** A verified camera's RTSP port and path (with query), without host or login. */
export type OnvifRtspTarget = { port: number; path: string };

const DEFAULT_RTSP_PORT = 554;

/**
 * The port and path of an RTSP URI a camera reported over ONVIF, with any userinfo dropped. Undefined
 * unless it is an rtsp:// URI whose host is exactly `ip` (so a camera cannot point us elsewhere).
 */
export function onvifRtspTarget(uri: string, ip: string): OnvifRtspTarget | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  if (url.protocol !== "rtsp:" || url.hostname !== ip) return undefined;
  return { port: url.port ? Number(url.port) : DEFAULT_RTSP_PORT, path: `${url.pathname || "/"}${url.search}` };
}
