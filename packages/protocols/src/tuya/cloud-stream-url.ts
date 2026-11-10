import type { CloudStreamType } from './cloud-stream.js';

const PROTOCOLS: Record<CloudStreamType, ReadonlySet<string>> = {
  rtsp: new Set(['rtsp:', 'rtsps:']),
  hls: new Set(['https:']),
};

/** Whitespace, C0/C1 control characters, or `#` (go2rtc's source-modifier separator). */
const UNSAFE = /[\s\u0000-\u001f\u007f-\u009f#]/;

/**
 * Whether a cloud-allocated URL is safe to hand to go2rtc as a source for `type`: an absolute URL with
 * the protocol that type uses, and nothing go2rtc would read as another source scheme (`exec:`,
 * `ffmpeg:`, ...) or as a `#modifier`.
 */
export function isSafeCloudStreamUrl(url: string, type: CloudStreamType): boolean {
  if (UNSAFE.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return PROTOCOLS[type].has(parsed.protocol) && parsed.host !== '';
}
