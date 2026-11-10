import {
  SAMSUNG_APP_IDS,
  SAMSUNG_KEYS,
  SamsungPairing,
  SamsungPairingTimeoutError,
  SamsungRemote,
  SamsungUnauthorizedError,
  fetchSamsungInfo,
  parseMac,
  sendMagicPacket,
  ssdpSearch,
  type SamsungInfo,
  type SamsungPaired,
  type SsdpReply,
  type SsdpSearchOptions,
} from "@home/protocols";
import { DeviceNotReadyError, DeviceOfflineError, PairingRejectedError } from "../errors.js";
import type { DeviceRecord, Discovered, DiscoveryReport, Driver, DriverContext, PairingSession, StatePatch, TvApp, TvCapability } from "../types.js";
import { LinkRegistry } from "./link-registry.js";
import { SamsungLink, type SamsungRemoteLike } from "./samsung-link.js";

export interface SamsungPairingLike {
  finish(): Promise<SamsungPaired>;
  cancel(): void;
}

export interface SamsungDriverOptions {
  search?: (opts: SsdpSearchOptions) => Promise<SsdpReply[]>;
  fetchInfo?: (ip: string) => Promise<SamsungInfo>;
  /** Wake-on-LAN. */
  send?: (mac: string) => Promise<void>;
  connect?: (host: string, paired: SamsungPaired) => Promise<SamsungRemoteLike>;
  pair?: (host: string) => Promise<SamsungPairingLike>;
  bindAddress?: string;
  pollIntervalMs?: number;
  discoveryIntervalMs?: number;
}

const SEARCH_TARGETS = ["urn:dial-multiscreen-org:service:dial:1", "upnp:rootdevice"];
const SEARCH_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 5000;
const DISCOVERY_INTERVAL_MS = 60_000;
const SAMSUNG_APPS = Object.keys(SAMSUNG_APP_IDS) as TvApp[];

/** The pairing token and pinned certificate (Device.secret, decrypted), or undefined. */
export function parseSamsungSecret(secretPlain: string | undefined): SamsungPaired | undefined {
  if (!secretPlain) return undefined;
  try {
    const s = JSON.parse(secretPlain) as Partial<SamsungPaired>;
    if (typeof s.token === "string" && typeof s.tvCertSha256 === "string") return { token: s.token, tvCertSha256: s.tvCertSha256 };
  } catch {
    // unreadable: pair again
  }
  return undefined;
}

const macOf = (d: DeviceRecord): string | undefined => {
  const mac = (d.config as { mac?: unknown } | null)?.mac;
  return typeof mac === "string" ? mac : undefined;
};

function toDiscovered(ip: string, info: SamsungInfo): Discovered {
  const mac = info.wifiMac ? parseMac(info.wifiMac) : undefined;
  return { brand: "SAMSUNG", kind: "TV", externalId: info.id, ip, name: info.name, model: info.modelName || undefined, ...(mac ? { config: { mac } } : {}) };
}

/**
 * Samsung Tizen TVs (2016+). Found by SSDP and confirmed by /api/v2/; paired by accepting a prompt on
 * the TV; power followed by polling /api/v2/, power-on by Wake-on-LAN.
 */
export class SamsungDriver implements Driver {
  readonly brand = "SAMSUNG" as const;
  private readonly links = new LinkRegistry<SamsungLink>();
  private ctx: DriverContext | undefined;
  private discoveryTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: SamsungDriverOptions = {}) {}

  readonly tv: TvCapability = {
    sendKey: (device, key) => this.link(device).key(SAMSUNG_KEYS[key]),
    launchApp: (device, app) => this.link(device).launch(SAMSUNG_APP_IDS[app]),
    apps: () => SAMSUNG_APPS,
    canPowerOn: (device) => macOf(device) !== undefined,
    startPairing: (device) => this.startPairing(device),
  };

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    void this.discoverNow();
    this.discoveryTimer = setInterval(() => void this.discoverNow(), this.opts.discoveryIntervalMs ?? DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.discoveryTimer);
    this.links.stopAll();
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    const ctx = this.context();
    this.links.sync(
      devices,
      (d) => d.id,
      (d) => JSON.stringify([d.ip, d.secretPlain, macOf(d)]),
      (d) => {
        const paired = parseSamsungSecret(d.secretPlain);
        if (!paired) {
          ctx.status(d.id, "NEEDS_PAIRING");
          return undefined;
        }
        if (!d.ip) return undefined;
        const link = new SamsungLink({ deviceId: d.id, ip: d.ip, mac: macOf(d), paired }, this.deps(), ctx);
        link.start();
        return link;
      },
    );
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    if (patch.on !== undefined) await this.link(device).setPower(patch.on);
  }

  async discoverNow(): Promise<DiscoveryReport> {
    const ctx = this.context();
    try {
      const replies = await (this.opts.search ?? ssdpSearch)({ st: SEARCH_TARGETS, timeoutMs: SEARCH_TIMEOUT_MS, bindAddress: this.opts.bindAddress });
      const ips = [...new Set(replies.filter((r) => r.server.includes("Samsung")).map((r) => r.ip))];
      for (const d of await Promise.all(ips.map((ip) => this.identify(ip)))) if (d) ctx.discovered(d);
    } catch (err) {
      ctx.log.warn("samsung: discovery failed", err);
    }
    return { authFailures: 0 };
  }

  /** The Samsung TV at `ip` when /api/v2/ answers (2016+ models), else undefined. */
  async identify(ip: string): Promise<Discovered | undefined> {
    try {
      return toDiscovered(ip, await this.fetchInfo(ip));
    } catch {
      return undefined;
    }
  }

  private async startPairing(device: DeviceRecord): Promise<PairingSession> {
    if (!device.ip) throw new DeviceOfflineError();
    const pairing = await (this.opts.pair ?? ((host: string) => SamsungPairing.start(host)))(device.ip);
    return {
      mode: "ACCEPT_ON_TV",
      finish: async () => {
        try {
          return JSON.stringify(await pairing.finish());
        } catch (err) {
          if (err instanceof SamsungUnauthorizedError || err instanceof SamsungPairingTimeoutError) throw new PairingRejectedError();
          throw err;
        }
      },
      cancel: () => pairing.cancel(),
    };
  }

  private deps() {
    return {
      fetchInfo: (ip: string) => this.fetchInfo(ip),
      send: this.opts.send ?? ((mac: string) => sendMagicPacket(mac)),
      connect: this.opts.connect ?? ((host: string, paired: SamsungPaired) => SamsungRemote.connect(host, paired)),
      pollIntervalMs: this.opts.pollIntervalMs ?? POLL_INTERVAL_MS,
    };
  }

  private fetchInfo(ip: string): Promise<SamsungInfo> {
    return (this.opts.fetchInfo ?? ((host: string) => fetchSamsungInfo(host)))(ip);
  }

  private link(device: DeviceRecord): SamsungLink {
    if (!parseSamsungSecret(device.secretPlain)) throw new DeviceNotReadyError("NEEDS_PAIRING");
    const link = this.links.get(device.id);
    if (!link) throw new DeviceOfflineError();
    return link;
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("SamsungDriver not started");
    return this.ctx;
  }
}
