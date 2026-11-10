import { GoveeLan, type GoveeDeviceInfo } from "@home/protocols";
import { DeviceOfflineError } from "../errors.js";
import type { DeviceRecord, Driver, DriverContext, StatePatch } from "../types.js";
import { GoveeLink, type GoveeLanEvent, type GoveeLanListener, type GoveeLanPort } from "./govee-link.js";
import { goveeToDiscovered } from "./govee-mapping.js";
import { LinkRegistry } from "./link-registry.js";

export type { GoveeLanPort } from "./govee-link.js";

export interface GoveeDriverOptions {
  /** Injected in tests; defaults to a GoveeLan on `bindAddress`. */
  lan?: GoveeLanPort;
  bindAddress?: string;
  pollIntervalMs?: number;
  scanIntervalMs?: number;
}

const POLL_INTERVAL_MS = 5000;
const SCAN_INTERVAL_MS = 60_000;

/**
 * Govee LAN API. Scans by multicast and, since multicast may not route on this host, also by
 * unicast to the IPs of known devices. Adopted lights are polled every 5 s.
 */
export class GoveeDriver implements Driver {
  readonly brand = "GOVEE" as const;
  private readonly lan: GoveeLanPort;
  private readonly links = new LinkRegistry<GoveeLink>();
  private ctx: DriverContext | undefined;
  private scanTimer: NodeJS.Timeout | undefined;
  private lanStarted = false;
  private listeners: [GoveeLanEvent, GoveeLanListener][] = [];

  constructor(private readonly opts: GoveeDriverOptions = {}) {
    this.lan = opts.lan ?? new GoveeLan({ bindAddress: opts.bindAddress });
  }

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    this.listeners = [
      ["device", (info: GoveeDeviceInfo) => ctx.discovered(goveeToDiscovered(info))],
      ["socketError", (err: unknown) => ctx.log.warn("govee: socket error", err)],
      ["scanError", (err: unknown) => ctx.log.warn("govee: scan failed", err)],
    ];
    for (const [event, fn] of this.listeners) this.lan.on(event, fn);
    try {
      await this.lan.start();
    } catch (err) {
      ctx.log.warn("govee: LAN client unavailable", err);
      return;
    }
    this.lanStarted = true;
    this.scan();
    this.scanTimer = setInterval(() => this.scan(), this.opts.scanIntervalMs ?? SCAN_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.scanTimer);
    this.links.stopAll();
    for (const [event, fn] of this.listeners) this.lan.off(event, fn);
    this.listeners = [];
    if (this.lanStarted) await this.lan.stop();
    this.lanStarted = false;
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.context();
    const withIp = devices.filter((d): d is DeviceRecord & { ip: string } => !!d.ip);
    this.links.sync(
      withIp,
      (d) => d.id,
      (d) => d.ip,
      (d) => {
        const link = new GoveeLink(d.id, d.ip, this.lan, ctx, this.opts.pollIntervalMs ?? POLL_INTERVAL_MS);
        link.start();
        return link;
      },
    );
    this.scan();
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    const link = this.links.get(device.id);
    if (!link) throw new DeviceOfflineError();
    await link.setState(patch);
  }

  private scan(): void {
    if (!this.lanStarted) return;
    this.lan.scan(this.links.links().map((l) => l.ip));
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("GoveeDriver not started");
    return this.ctx;
  }
}
