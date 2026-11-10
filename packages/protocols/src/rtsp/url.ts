import { RtspError } from './errors.js';

/** Where to connect, and the request URL with any userinfo stripped (safe for the wire and for messages). */
export interface RtspTarget {
  host: string;
  port: number;
  url: string;
}

const DEFAULT_RTSP_PORT = 554;

/** Parses an `rtsp://` URL. The error message never echoes the input, which may contain credentials. */
export function parseRtspUrl(input: string): RtspTarget {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new RtspError('Invalid RTSP URL');
  }
  if (parsed.protocol !== 'rtsp:' || !parsed.hostname) throw new RtspError('Invalid RTSP URL');
  parsed.username = '';
  parsed.password = '';
  return {
    host: parsed.hostname.replace(/^\[(.*)\]$/, '$1'),
    port: parsed.port ? Number(parsed.port) : DEFAULT_RTSP_PORT,
    url: parsed.toString(),
  };
}
