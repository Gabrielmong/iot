import { RtspError } from './errors.js';

export interface RtspResponse {
  status: number;
  /** Header values by lower-cased name; repeated headers (e.g. several WWW-Authenticate) keep every value. */
  headers: Map<string, string[]>;
  body: string;
}

const MAX_HEADER_BYTES = 64 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const HEADER_END = Buffer.from('\r\n\r\n');

/**
 * Parses one complete RTSP response from the start of `buf`.
 * Returns undefined while more bytes are needed; throws RtspError on a malformed or oversized reply.
 */
export function parseRtspResponse(buf: Buffer): { response: RtspResponse; consumed: number } | undefined {
  const headerEnd = buf.indexOf(HEADER_END);
  if (headerEnd < 0) {
    if (buf.length > MAX_HEADER_BYTES) throw new RtspError('RTSP response headers too large');
    return undefined;
  }
  const [statusLine = '', ...lines] = buf.subarray(0, headerEnd).toString('latin1').split('\r\n');
  const match = /^RTSP\/\d\.\d (\d{3})(?: |$)/.exec(statusLine);
  if (!match) throw new RtspError('Malformed RTSP status line');

  const headers = new Map<string, string[]>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), line.slice(colon + 1).trim()]);
  }

  const length = Number(headers.get('content-length')?.[0] ?? 0);
  if (!Number.isInteger(length) || length < 0 || length > MAX_BODY_BYTES) throw new RtspError('Bad RTSP Content-Length');
  const bodyStart = headerEnd + HEADER_END.length;
  if (buf.length < bodyStart + length) return undefined;
  return {
    response: { status: Number(match[1]), headers, body: buf.subarray(bodyStart, bodyStart + length).toString('utf8') },
    consumed: bodyStart + length,
  };
}
