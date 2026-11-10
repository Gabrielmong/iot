import { rtspDescribe } from "@home/protocols";
import { rtspUrl } from "../../cameras/streams/source-url.js";
import { DeviceNotReadyError } from "../errors.js";
import type { SwannSettings } from "../swann-settings.js";
import type { DeviceRecord, Driver, DriverContext } from "../types.js";
import { LinkRegistry } from "./link-registry.js";
import { probeToDiscovered, statusPath, swannCameraConfig } from "./swann-mapping.js";
import { SwannLink, type SwannDescribe } from "./swann-link.js";

export interface SwannDriverOptions {
  settings: () => Promise<SwannSettings | undefined>;
  /** Injected in tests; defaults to rtspDescribe (Digest only). */
  describe?: SwannDescribe;
  pollIntervalMs?: number;
  discoveryIntervalMs?: number;
}

const POLL_INTERVAL_MS = 30_000;
const DISCOVERY_INTERVAL_MS = 60_000;

/**
 * Swann recorder cameras. Discovery replays the stored probe result (one CAMERA per channel); each
 * adopted camera is checked by an RTSP DESCRIBE every 30 s. Without a stored probe nothing happens.
 */
export class SwannDriver implements Driver {
  readonly brand = "SWANN" as const;
  private readonly links = new LinkRegistry<SwannLink>();
  private readonly describe: SwannDescribe;
  private ctx: DriverContext | undefined;
  private discoveryTimer: NodeJS.Timeout | undefined;
  /** A settings read in flight when stop() runs must not report or create links. */
  private stopped = false;

  constructor(private readonly opts: SwannDriverOptions) {
    this.describe = opts.describe ?? ((url, creds, timeoutMs) => rtspDescribe(url, creds, timeoutMs));
  }

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    this.stopped = false;
    void this.discoverOnce();
    this.discoveryTimer = setInterval(() => void this.discoverOnce(), this.opts.discoveryIntervalMs ?? DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.discoveryTimer);
    this.links.stopAll();
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.context();
    const settings = await this.readSettings();
    if (this.stopped || settings === "failed") return;
    if (!settings) {
      this.links.stopAll();
      for (const d of devices) ctx.status(d.id, "NEEDS_CREDENTIALS");
      return;
    }
    const { host, creds } = settings;
    this.links.sync(
      devices,
      (d) => d.id,
      (d) => JSON.stringify([host, creds, d.config]),
      (d) => {
        const channel = swannCameraConfig(d.config);
        if (!channel) {
          ctx.log.warn(`swann: device ${d.id} has no stream config`);
          return undefined;
        }
        const link = new SwannLink(d.id, rtspUrl(host, statusPath(channel)), creds, this.describe, ctx, this.opts.pollIntervalMs ?? POLL_INTERVAL_MS);
        link.start();
        return link;
      },
    );
  }

  async setState(): Promise<void> {
    throw new DeviceNotReadyError("cameras take no commands");
  }

  private async discoverOnce(): Promise<void> {
    const settings = await this.readSettings();
    if (this.stopped || settings === "failed" || !settings?.probe) return;
    const ctx = this.context();
    for (const d of probeToDiscovered(settings.host, settings.probe)) ctx.discovered(d);
  }

  /** "failed" when the settings could not be read (e.g. the database is down): keep things as they are. */
  private async readSettings(): Promise<SwannSettings | undefined | "failed"> {
    try {
      return await this.opts.settings();
    } catch (err) {
      this.context().log.warn(`swann: cannot read recorder settings: ${err instanceof Error ? err.message : String(err)}`);
      return "failed";
    }
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("SwannDriver not started");
    return this.ctx;
  }
}
