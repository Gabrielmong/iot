import { authorizationFor, type RtspCredentials } from '../digest-auth/authorization.js';
import { RtspConnection } from './connection.js';
import { RtspAuthUnsupportedError, RtspTimeoutError } from './errors.js';
import { formatRtspRequest } from './request.js';
import type { RtspResponse } from './response.js';
import { parseRtspUrl, type RtspTarget } from './url.js';
import { parseWwwAuthenticate } from '../digest-auth/www-authenticate.js';

export interface RtspDescribeResult {
  status: number;
  /** The SDP body of a 200 reply. */
  sdp?: string;
  /**
   * The lower-cased auth schemes the server's 401 challenge offered, in header order (e.g.
   * `['basic', 'digest']`); absent when there was no challenge. Clients such as go2rtc answer only the
   * first one, so a caller may refuse a server that offers Basic at all.
   */
  authSchemes?: string[];
}

export interface RtspDescribeOptions {
  /** Answer a Basic-only challenge (sends the password in cleartext). Default false. */
  allowBasic?: boolean;
}

const USER_AGENT = 'home-control';

/**
 * Sends DESCRIBE (no OPTIONS first). On a 401 it retries once with Digest (preferred) or, if allowed,
 * Basic, on the same connection, or on a fresh one if the server closed it after the challenge.
 * Credentials only travel in the Authorization header; any userinfo in `url` is stripped from the request line.
 * Rejects with RtspTimeoutError / RtspError on transport failures, and with RtspAuthUnsupportedError
 * (no credentials sent) when the challenge offers no acceptable scheme. RTSP statuses are returned.
 */
export async function rtspDescribe(
  url: string,
  creds: RtspCredentials,
  timeoutMs = 3000,
  opts: RtspDescribeOptions = {},
): Promise<RtspDescribeResult> {
  const session = new DescribeSession(parseRtspUrl(url), timeoutMs);
  try {
    let res = await session.describe();
    let authSchemes: string[] | undefined;
    if (res.status === 401) {
      const challenges = parseWwwAuthenticate(res.headers.get('www-authenticate') ?? []);
      authSchemes = challenges.map((c) => c.scheme);
      if (challenges.length > 0) {
        const authorization = authorizationFor(challenges, creds, 'DESCRIBE', session.target.url, opts.allowBasic);
        if (!authorization) throw new RtspAuthUnsupportedError(session.target.url, challenges.map((c) => c.scheme));
        res = await session.describeAgain(authorization);
      }
    }
    const schemes = authSchemes ? { authSchemes } : {};
    return res.status === 200 ? { status: 200, sdp: res.body, ...schemes } : { status: res.status, ...schemes };
  } finally {
    session.close();
  }
}

/** The connection and CSeq counter for one rtspDescribe call. */
class DescribeSession {
  private conn: RtspConnection | undefined;
  private cseq = 1;

  constructor(
    readonly target: RtspTarget,
    private readonly timeoutMs: number,
  ) {}

  async describe(authorization?: string): Promise<RtspResponse> {
    this.conn ??= await RtspConnection.open(this.target, this.timeoutMs);
    const headers: [string, string][] = [['CSeq', String(this.cseq++)], ['Accept', 'application/sdp'], ['User-Agent', USER_AGENT]];
    if (authorization) headers.push(['Authorization', authorization]);
    return this.conn.exchange(formatRtspRequest('DESCRIBE', this.target.url, headers));
  }

  /** Reuses the connection; if the server closed it after the challenge, retries on a fresh one. */
  async describeAgain(authorization: string): Promise<RtspResponse> {
    if (this.conn && !this.conn.closed) {
      try {
        return await this.describe(authorization);
      } catch (err) {
        if (err instanceof RtspTimeoutError || !this.conn.closed) throw err;
      }
    }
    this.conn = undefined;
    return this.describe(authorization);
  }

  close(): void {
    this.conn?.close();
  }
}
