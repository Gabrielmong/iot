import type { RtspCredentials, VideoCodec } from "@home/protocols";

/** The standard RTSP port (the Swann recorder's). */
export const RTSP_PORT = 554;

/** `rtsp://<host>:<port><path>` without credentials (DESCRIBE sends them in a header). */
export function rtspUrl(host: string, path: string, port = RTSP_PORT): string {
  return `rtsp://${host}:${port}${path}`;
}

/** The URL with the login URL-encoded into its userinfo. Server-side only: never log or return it. */
export function rtspSourceUrl(host: string, creds: RtspCredentials, path: string, port = RTSP_PORT): string {
  return `rtsp://${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}@${host}:${port}${path}`;
}

/** The go2rtc source: browsers cannot play H265, so it is transcoded to H264 through ffmpeg. */
export function goSource(url: string, codec: VideoCodec): string {
  return codec === "H265" ? `ffmpeg:${url}#video=h264` : url;
}

/**
 * Whether go2rtc's PATCH would make `src` an alias of an existing stream instead of a source: it does
 * so for an rtsp:// URL whose path (minus the leading slash) is a stream name.
 */
export function aliasesStream(src: string, names: Iterable<string>): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "rtsp:" || url.pathname.length <= 1) return false;
  const path = decodeURIComponent(url.pathname.slice(1));
  for (const name of names) if (path === name) return true;
  return false;
}
