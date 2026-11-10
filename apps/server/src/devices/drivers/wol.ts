import { probeTcp, sendMagicPacket } from "@home/protocols";
import type { DeviceRecord, Driver, DriverContext, StatePatch } from "../types.js";
import { LinkRegistry } from "./link-registry.js";
import { WolLink, type Probe } from "./wol-link.js";

export interface WolDriverOptions {
  /** Injected in tests. */
  send?: (mac: string) => Promise<void>;
  probe?: Probe;
  pollIntervalMs?: number;
}

const POLL_INTERVAL_MS = 10_000;

/** The MAC a computer is woken by (its externalId is the same, normalised). */
export const macOf = (d: DeviceRecord): string => String((d.config as { mac?: unknown }).mac ?? d.externalId);

/** Computers added by hand: woken with a magic packet, and shown awake when a probe port answers. */
export class WolDriver implements Driver {
  readonly brand = "WOL" as const;
  private readonly links = new LinkRegistry<WolLink>();
  private ctx: DriverContext | undefined;

  constructor(private readonly opts: WolDriverOptions = {}) {}

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
  }

  async stop(): Promise<void> {
    this.links.stopAll();
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("WolDriver not started");
    const probe = this.opts.probe ?? probeTcp;
    this.links.sync(
      devices,
      (d) => d.id,
      (d) => JSON.stringify([d.ip, macOf(d)]),
      (d) => {
        const link = new WolLink(d, ctx, probe, this.opts.pollIntervalMs ?? POLL_INTERVAL_MS);
        link.start();
        return link;
      },
    );
  }

  /** Only waking is possible; the manager refuses `on: false` before it gets here. */
  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    if (patch.on !== true) return;
    await (this.opts.send ?? sendMagicPacket)(macOf(device));
    this.links.get(device.id)?.pollNow();
  }
}
