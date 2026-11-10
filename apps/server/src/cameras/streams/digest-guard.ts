import type { RtspCredentials, RtspDescribeResult } from "@home/protocols";
import { CameraUnavailableError } from "./errors.js";

/** How long a passed check is trusted per camera. */
export const DIGEST_CHECK_TTL_MS = 10 * 60_000;

export interface DigestGuardOptions {
  /** RTSP DESCRIBE that answers Digest only (never Basic); rejects RtspAuthUnsupportedError otherwise. */
  describe: (url: string, creds: RtspCredentials) => Promise<RtspDescribeResult>;
  /** Given only device ids and error class names / statuses. */
  log: Pick<Console, "warn">;
  now?: () => number;
  ttlMs?: number;
}

/** What the resolvers need from the guard. */
export type StreamLoginCheck = Pick<DigestGuard, "check">;

/**
 * Fails closed before a LOCAL RTSP source carrying a login goes to go2rtc: go2rtc (or ffmpeg) may answer a
 * Basic challenge with the URL's credentials in cleartext, so our own Digest-only DESCRIBE must succeed
 * first, from a server that offers no Basic at all. A pass is cached per camera (and URL) for DIGEST_CHECK_TTL_MS; anything but a 200 throws
 * CameraUnavailableError, so nothing is registered.
 */
export class DigestGuard {
  private readonly passed = new Map<string, { url: string; at: number }>();

  constructor(private readonly opts: DigestGuardOptions) {}

  /** `url` has no userinfo; `creds` go only in the Digest Authorization header. */
  async check(deviceId: string, url: string, creds: RtspCredentials): Promise<void> {
    const now = this.now();
    const hit = this.passed.get(deviceId);
    if (hit && hit.url === url && now - hit.at < (this.opts.ttlMs ?? DIGEST_CHECK_TTL_MS)) return;
    this.passed.delete(deviceId);
    const failure = await this.describe(url, creds);
    if (failure) {
      this.opts.log.warn(`streams: camera ${deviceId} failed the Digest login check (${failure}); not registering it`);
      throw new CameraUnavailableError("camera stream failed the Digest login check");
    }
    this.passed.set(deviceId, { url, at: this.now() });
  }

  /**
   * Undefined on a 200 from a server that never offers Basic; else a log-safe reason (an error class
   * name, "Basic offered", or the status). go2rtc's RTSP client answers only the first WWW-Authenticate
   * header (pkg/tcp/auth.go, v1.9.15), so Basic anywhere in the challenge fails closed.
   */
  private async describe(url: string, creds: RtspCredentials): Promise<string | undefined> {
    try {
      const { status, authSchemes = [] } = await this.opts.describe(url, creds);
      if (authSchemes.includes("basic")) return "Basic offered";
      return status === 200 ? undefined : `status ${status}`;
    } catch (err) {
      return err instanceof Error ? err.name : "error";
    }
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }
}
