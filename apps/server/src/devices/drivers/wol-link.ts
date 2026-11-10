import type { DeviceRecord, DriverContext } from "../types.js";
import { Poller } from "./poller.js";

/** Windows file sharing, Remote Desktop, SSH: any one answering means the computer is awake. */
export const AWAKE_PORTS = [445, 3389, 22] as const;
export const PROBE_TIMEOUT_MS = 1000;

export type Probe = (host: string, ports: readonly number[], timeoutMs: number) => Promise<boolean>;

/**
 * One computer. Without an IP there is nothing to probe: it is reported ready to wake, with no
 * awake/asleep state. With an IP it is probed every interval; `on` is whether it answered.
 */
export class WolLink {
  private readonly poller: Poller | undefined;
  private stopped = false;

  constructor(private readonly record: DeviceRecord, private readonly ctx: DriverContext, probe: Probe, intervalMs: number) {
    const ip = record.ip;
    if (ip) {
      this.poller = new Poller(
        async () => {
          const awake = await probe(ip, AWAKE_PORTS, PROBE_TIMEOUT_MS);
          if (!this.stopped) ctx.state(record.id, { online: true, on: awake });
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

  /** After a wake, check sooner than the next scheduled probe. */
  pollNow(): void {
    this.poller?.pollNow();
  }

  stop(): void {
    this.stopped = true;
    this.poller?.stop();
  }
}
