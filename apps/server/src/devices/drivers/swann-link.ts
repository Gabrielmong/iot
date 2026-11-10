import type { RtspCredentials } from "@home/protocols";
import type { DriverContext } from "../types.js";
import type { FailureKind } from "./backoff.js";
import { Poller } from "./poller.js";

/** An RTSP DESCRIBE (`rtspDescribe` in production, never with Basic auth). */
export type SwannDescribe = (url: string, creds: RtspCredentials, timeoutMs: number) => Promise<{ status: number }>;

/** Below the 30 s poll interval; a DESCRIBE is a single small request. */
const DESCRIBE_TIMEOUT_MS = 3000;

/** The recorder rejected the login. */
class SwannLoginRejected extends Error {}

/**
 * Checks one adopted camera by DESCRIBE of its stream (`url` carries no credentials): 200 is online,
 * 401 is NEEDS_CREDENTIALS, anything else (status or transport failure) is offline.
 */
export class SwannLink {
  private readonly poller: Poller;
  /** A DESCRIBE in flight when stop() runs must not report for a device that may be gone. */
  private stopped = false;

  constructor(
    private readonly deviceId: string,
    private readonly url: string,
    private readonly creds: RtspCredentials,
    private readonly describe: SwannDescribe,
    private readonly ctx: DriverContext,
    pollIntervalMs: number,
  ) {
    this.poller = new Poller(() => this.poll(), (err) => this.onPollError(err), { intervalMs: pollIntervalMs });
  }

  start(): void {
    this.poller.start();
  }

  stop(): void {
    this.stopped = true;
    this.poller.stop();
  }

  private async poll(): Promise<void> {
    const { status } = await this.describe(this.url, this.creds, DESCRIBE_TIMEOUT_MS);
    if (status === 401) throw new SwannLoginRejected();
    if (status !== 200) throw new Error(`DESCRIBE answered ${status}`);
    if (this.stopped) return;
    this.ctx.status(this.deviceId, "OK");
    this.ctx.state(this.deviceId, { online: true });
  }

  private onPollError(err: unknown): FailureKind {
    const auth = err instanceof SwannLoginRejected;
    if (this.stopped) return "transient";
    if (auth) this.ctx.status(this.deviceId, "NEEDS_CREDENTIALS");
    this.ctx.state(this.deviceId, { online: false });
    return auth ? "auth" : "transient";
  }
}
