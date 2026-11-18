import { probeSeen, RDP_PORT, rdpSeen } from "../computers/computer-config.js";
import type { DeviceRecord, DriverContext } from "../types.js";
import { Poller } from "./poller.js";
import { RetryTimer } from "./retry-timer.js";

/** Windows file sharing, Remote Desktop, SSH: any one answering means the computer is awake. */
export const AWAKE_PORTS = [445, RDP_PORT, 22] as const;
export const PROBE_TIMEOUT_MS = 1000;
/** After a wake, probe this often until the PC answers... */
export const WAKE_POLL_MS = 3000;
/** ...or this long has passed. */
export const WAKE_WATCH_MS = 120_000;

/** The ports that answered. */
export type Probe = (host: string, ports: readonly number[], timeoutMs: number) => Promise<number[]>;

/**
 * One computer. Without an IP there is nothing to probe: it is reported ready to wake, with no
 * awake/asleep state. With an IP it is probed every interval. A PC that never answered may just be
 * firewalled, so until it does a failed probe reports no `on`; its first answer (and Remote Desktop's)
 * is recorded in its config.
 */
export class WolLink {
  private readonly poller: Poller | undefined;
  private readonly wakeTimer = new RetryTimer();
  private wakeUntil = 0;
  private stopped = false;
  private seen: boolean;
  private rdp: boolean;

  constructor(private readonly record: DeviceRecord, private readonly ctx: DriverContext, probe: Probe, intervalMs: number) {
    this.seen = probeSeen(record);
    this.rdp = rdpSeen(record);
    const ip = record.ip;
    if (ip) {
      this.poller = new Poller(
        async () => {
          const open = await probe(ip, AWAKE_PORTS, PROBE_TIMEOUT_MS);
          if (!this.stopped) this.report(ip, open);
        },
        () => "transient",
        { intervalMs },
      );
    }
  }

  start(): void {
    this.ctx.status(this.record.id, "OK");
    if (this.poller) this.poller.start();
    else this.ctx.state(this.record.id, { online: true });
  }

  /** After a wake: probe every WAKE_POLL_MS until the PC answers or WAKE_WATCH_MS passes (restarts a running watch). */
  watchWake(): void {
    if (!this.poller) return;
    this.wakeUntil = Date.now() + WAKE_WATCH_MS;
    this.scheduleWakePoll();
  }

  stop(): void {
    this.stopped = true;
    this.wakeTimer.cancel();
    this.poller?.stop();
  }

  private scheduleWakePoll(): void {
    if (Date.now() >= this.wakeUntil) return;
    this.wakeTimer.schedule(WAKE_POLL_MS, () => {
      this.poller?.pollNow();
      this.scheduleWakePoll();
    });
  }

  private report(ip: string, open: number[]): void {
    const awake = open.length > 0;
    if (awake) this.wakeTimer.cancel();
    this.learn(ip, awake, open.includes(RDP_PORT));
    this.ctx.state(this.record.id, awake || this.seen ? { online: true, on: awake } : { online: true });
  }

  /** Records the first answer and the first Remote Desktop answer (the manager merges them into the config). */
  private learn(ip: string, awake: boolean, rdp: boolean): void {
    const config: Record<string, boolean> = {};
    if (awake && !this.seen) config.probeSeen = this.seen = true;
    if (rdp && !this.rdp) config.rdpSeen = this.rdp = true;
    if (Object.keys(config).length > 0) this.ctx.discovered({ brand: "WOL", externalId: this.record.externalId, ip, config });
  }
}
