import { startTuyaDiscovery } from "@home/protocols";
import { DeviceNotReadyError, DeviceOfflineError } from "../errors.js";
import type { DeviceRecord, Driver, DriverContext, StatePatch } from "../types.js";
import type { BackoffOptions } from "./backoff.js";
import { LinkRegistry } from "./link-registry.js";
import { TuyaLink } from "./tuya-link.js";
import { broadcastToDiscovered } from "./tuya-mapping.js";
import { planTuya } from "./tuya-target.js";

export interface TuyaDriverOptions {
  /** Injected in tests to avoid binding the real discovery ports. */
  startDiscovery?: typeof startTuyaDiscovery;
  bindAddress?: string;
  /** TCP port override (tests). */
  port?: number;
  /** Per-request timeout; below the manager's 3 s command timeout. */
  timeoutMs?: number;
  backoff?: Partial<BackoffOptions>;
}

const REQUEST_TIMEOUT_MS = 2500;

/** Tuya over the LAN: listens for discovery broadcasts and keeps a persistent connection per adopted device. */
export class TuyaDriver implements Driver {
  readonly brand = "TUYA" as const;
  private readonly links = new LinkRegistry<TuyaLink>();
  private ctx: DriverContext | undefined;
  private discovery: { stop(): Promise<void> } | undefined;

  constructor(private readonly opts: TuyaDriverOptions = {}) {}

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    const start = this.opts.startDiscovery ?? startTuyaDiscovery;
    try {
      this.discovery = await start((b) => ctx.discovered(broadcastToDiscovered(b)), { bindAddress: this.opts.bindAddress });
    } catch (err) {
      ctx.log.warn("tuya: discovery unavailable", err);
    }
  }

  async stop(): Promise<void> {
    this.links.stopAll();
    await this.discovery?.stop();
    this.discovery = undefined;
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.context();
    this.links.sync(
      devices,
      (d) => d.id,
      (d) => JSON.stringify([d.ip, d.secretPlain, d.kind, d.config]),
      (d) => {
        const plan = planTuya(d);
        if ("skip" in plan) {
          if (plan.skip === "needs-key") ctx.status(d.id, "NEEDS_KEY");
          return undefined;
        }
        const link = new TuyaLink(plan.connect, ctx, { port: this.opts.port, timeoutMs: this.opts.timeoutMs ?? REQUEST_TIMEOUT_MS, backoff: this.opts.backoff });
        link.start();
        return link;
      },
    );
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    const link = this.links.get(device.id);
    if (link) return link.setState(patch);
    const plan = planTuya(device);
    if ("skip" in plan && plan.skip !== "no-ip") throw new DeviceNotReadyError(plan.skip);
    throw new DeviceOfflineError();
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("TuyaDriver not started");
    return this.ctx;
  }
}
