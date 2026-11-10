import { discoverKasa, KasaAuthError, KasaClient, KlapSession, type KasaDiscoveredDevice } from "@home/protocols";
import { DeviceNotReadyError, DeviceOfflineError } from "../errors.js";
import type { KasaCredentials } from "../kasa-credentials.js";
import type { DeviceRecord, DiscoveryReport, Driver, DriverContext, StatePatch } from "../types.js";
import { KasaLink } from "./kasa-link.js";
import { parseKasaExternalId, sysInfoToDiscovered } from "./kasa-mapping.js";
import { LinkRegistry } from "./link-registry.js";

export interface KasaDriverOptions {
  credentials: () => Promise<KasaCredentials | undefined>;
  /** Injected in tests. */
  discover?: (timeoutMs: number) => Promise<KasaDiscoveredDevice[]>;
  bindAddress?: string;
  /** HTTP port override (tests). */
  port?: number;
  pollIntervalMs?: number;
  discoveryIntervalMs?: number;
}

const POLL_INTERVAL_MS = 5000;
const DISCOVERY_INTERVAL_MS = 60_000;
const DISCOVERY_TIMEOUT_MS = 3000;
/** Per HTTP request; below the manager's 3 s command timeout. KlapSession does not retry. */
const REQUEST_TIMEOUT_MS = 2500;

type Group = { deviceId: string; ip: string; records: DeviceRecord[] };

/**
 * TP-Link Kasa (KLAP). Discovery only yields IPs; each is identified by its sysinfo deviceId, which
 * needs the TP-Link credentials. Adopted devices are polled every 5 s, one link per physical device.
 */
export class KasaDriver implements Driver {
  readonly brand = "KASA" as const;
  private readonly links = new LinkRegistry<KasaLink>();
  private ctx: DriverContext | undefined;
  private credentials: KasaCredentials | undefined;
  private discoveryTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: KasaDriverOptions) {}

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    this.credentials = await this.opts.credentials();
    void this.discoverOnce();
    this.discoveryTimer = setInterval(() => void this.discoverOnce(), this.opts.discoveryIntervalMs ?? DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.discoveryTimer);
    this.links.stopAll();
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.context();
    const creds = (this.credentials = await this.opts.credentials());
    if (!creds) {
      this.links.stopAll();
      for (const d of devices) ctx.status(d.id, "NEEDS_CREDENTIALS");
      return;
    }
    this.links.sync(
      groupByDevice(devices),
      (g) => g.deviceId,
      (g) => JSON.stringify([g.ip, creds, g.records.map((r) => r.id)]),
      (g) => {
        const link = new KasaLink(g.ip, g.records, this.client(g.ip, creds), ctx, this.opts.pollIntervalMs ?? POLL_INTERVAL_MS);
        link.start();
        return link;
      },
    );
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    if (!this.credentials) throw new DeviceNotReadyError("NEEDS_CREDENTIALS");
    const link = this.links.get(parseKasaExternalId(device.externalId).deviceId);
    if (!link) throw new DeviceOfflineError();
    await link.setState(device, patch);
  }

  /**
   * Discovers and identifies every Kasa device now, linked ones included, so new credentials are
   * checked at once. Resolves with how many devices rejected them.
   */
  discoverNow(): Promise<DiscoveryReport> {
    return this.discoverOnce(true);
  }

  private async discoverOnce(includeLinked = false): Promise<DiscoveryReport> {
    const ctx = this.context();
    try {
      const discover = this.opts.discover ?? ((ms: number) => discoverKasa(ms, { bindAddress: this.opts.bindAddress }));
      const found = await discover(DISCOVERY_TIMEOUT_MS);
      const creds = this.credentials;
      if (!creds) {
        if (found.length > 0) ctx.log.warn(`kasa: ${found.length} device(s) found, but no TP-Link credentials are stored`);
        return { authFailures: 0 };
      }
      // Linked devices are kept current by their own polls; identifying them again costs a handshake.
      const linked = new Set(includeLinked ? [] : this.links.links().map((l) => l.ip));
      const results = await Promise.all(found.filter((f) => !linked.has(f.ip)).map((f) => this.handshake(f.ip, creds)));
      return { authFailures: results.filter((r) => r === "auth-failed").length };
    } catch (err) {
      ctx.log.warn("kasa: discovery failed", err);
      return { authFailures: 0 };
    }
  }

  /** The discovery reply's id is not the sysinfo deviceId, so each IP is asked for its sysinfo. */
  private async handshake(ip: string, creds: KasaCredentials): Promise<"ok" | "auth-failed" | "failed"> {
    try {
      const info = await this.client(ip, creds).getSysInfo();
      this.context().discovered(sysInfoToDiscovered(info, ip));
      return "ok";
    } catch (err) {
      this.context().log.warn(`kasa: cannot identify ${ip}`, err);
      return err instanceof KasaAuthError ? "auth-failed" : "failed";
    }
  }

  private client(ip: string, creds: KasaCredentials): KasaClient {
    return new KasaClient(new KlapSession({ ip, ...creds, port: this.opts.port, timeoutMs: REQUEST_TIMEOUT_MS }));
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("KasaDriver not started");
    return this.ctx;
  }
}

/** One group per physical device: a strip and its outlets share the deviceId and ip. */
function groupByDevice(devices: DeviceRecord[]): Group[] {
  const groups = new Map<string, Group>();
  for (const d of devices) {
    const { deviceId } = parseKasaExternalId(d.externalId);
    const group = groups.get(deviceId) ?? { deviceId, ip: "", records: [] };
    group.records.push(d);
    if (d.ip && (!group.ip || d.externalId === deviceId)) group.ip = d.ip;
    groups.set(deviceId, group);
  }
  return [...groups.values()].filter((g) => g.ip !== "");
}
