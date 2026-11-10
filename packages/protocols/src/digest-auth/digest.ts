import { createHash } from 'node:crypto';

export interface DigestInput {
  username: string;
  password: string;
  realm: string;
  nonce: string;
  method: string;
  /** The request URI exactly as sent on the request line (for RTSP the full URL, for HTTP the path). */
  uri: string;
  /** Present when the server offered `qop=auth`. */
  qop?: { nc: string; cnonce: string };
}

/** RFC 2617 MD5 digest `response`: MD5(HA1:nonce:HA2), or MD5(HA1:nonce:nc:cnonce:auth:HA2) with qop=auth. */
export function digestResponse(input: DigestInput): string {
  const ha1 = md5(`${input.username}:${input.realm}:${input.password}`);
  const ha2 = md5(`${input.method}:${input.uri}`);
  if (!input.qop) return md5(`${ha1}:${input.nonce}:${ha2}`);
  return md5(`${ha1}:${input.nonce}:${input.qop.nc}:${input.qop.cnonce}:auth:${ha2}`);
}

function md5(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex');
}
