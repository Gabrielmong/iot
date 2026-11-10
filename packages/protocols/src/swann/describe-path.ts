import type { RtspCredentials } from '../digest-auth/authorization.js';
import { rtspDescribe } from '../rtsp/describe.js';
import { RtspAuthUnsupportedError, RtspError } from '../rtsp/errors.js';
import { SwannAuthError, SwannUnreachableError } from './errors.js';

export interface SwannTarget {
  host: string;
  port: number;
  creds: RtspCredentials;
  timeoutMs: number;
  allowBasic: boolean;
}

/**
 * DESCRIBEs one path on the recorder. Returns the SDP on 200 and undefined for any other non-auth status.
 * Throws SwannAuthError on a 401 that survived authorisation or an unacceptable auth scheme, and
 * SwannUnreachableError on transport failures.
 */
export async function describeSwannPath(target: SwannTarget, path: string): Promise<string | undefined> {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  let res;
  try {
    res = await rtspDescribe(`rtsp://${host}:${target.port}${path}`, target.creds, target.timeoutMs, { allowBasic: target.allowBasic });
  } catch (err) {
    if (err instanceof RtspAuthUnsupportedError) {
      throw new SwannAuthError(target.host, 'requested an unsupported or insecure authentication method', { cause: err });
    }
    if (err instanceof RtspError) throw new SwannUnreachableError(target.host, { cause: err });
    throw err;
  }
  if (res.status === 401) throw new SwannAuthError(target.host);
  return res.status === 200 ? (res.sdp ?? '') : undefined;
}
