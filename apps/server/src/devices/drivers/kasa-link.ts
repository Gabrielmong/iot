import { KasaAuthError, type KasaClient } from "@home/protocols";
import type { DeviceRecord, DriverContext, StatePatch } from "../types.js";
import type { FailureKind } from "./backoff.js";
import { kasaStates, parseKasaExternalId, recordsSwitchedBy, sysInfoToDiscovered } from "./kasa-mapping.js";
import { Poller } from "./poller.js";

/**
 * Polls one Kasa device (a plug, or a strip with its adopted outlets) and switches its relays.
 * Each poll also reports the device as discovered, which keeps its ip and lastSeenAt current.
 */
export class KasaLink {
  private readonly poller: Poller;
  /** A poll in flight when stop() runs must not report for a device that may be gone. */
  private stopped = false;

  constructor(
    readonly ip: string,
    private readonly records: DeviceRecord[],
    private readonly client: KasaClient,
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

  async setState(record: DeviceRecord, patch: StatePatch): Promise<void> {
    if (patch.on === undefined) return;
    // Without a child id a strip switches every outlet, as python-kasa's IotStrip does.
    await this.client.setRelay(patch.on, parseKasaExternalId(record.externalId).childId);
    // Report the switched state now; the immediate poll below corrects any drift.
    if (!this.stopped) for (const r of recordsSwitchedBy(record, this.records)) this.ctx.state(r.id, { online: true, on: patch.on });
    this.poller.pollNow();
  }

  private async poll(): Promise<void> {
    const info = await this.client.getSysInfo();
    if (this.stopped) return;
    this.ctx.discovered(sysInfoToDiscovered(info, this.ip));
    for (const r of this.records) this.ctx.status(r.id, "OK");
    for (const { deviceId, state } of kasaStates(info, this.records)) this.ctx.state(deviceId, state);
  }

  private onPollError(err: unknown): FailureKind {
    const auth = err instanceof KasaAuthError;
    if (this.stopped) return "transient";
    for (const r of this.records) {
      if (auth) this.ctx.status(r.id, "NEEDS_CREDENTIALS");
      this.ctx.state(r.id, { online: false });
    }
    return auth ? "auth" : "transient";
  }
}
