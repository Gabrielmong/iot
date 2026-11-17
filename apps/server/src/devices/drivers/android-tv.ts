import {
  ANDROID_TV_REMOTE_PORT,
  AndroidTvBadCodeError,
  AndroidTvPairing,
  AndroidTvPairingFailedError,
  AndroidTvRemote,
  createClientCertificate,
  lookupMac,
  probeTcp,
  sendMagicPacket,
  ssdpSearch,
  type AndroidTvPairingResult,
  type ClientCertificate,
  type PairedTv,
  type SsdpReply,
  type SsdpSearchOptions,
} from "@home/protocols";
import { DeviceNotReadyError, DeviceOfflineError, PairingRejectedError, WrongPairingCodeError } from "../errors.js";
import type { DeviceRecord, Discovered, DiscoveryReport, Driver, DriverContext, PairingSession, StatePatch, TvCapability } from "../types.js";
import { AndroidTvLink, type RemoteLike } from "./android-tv-link.js";
import { ANDROID_TV_APPS, androidAppLink, androidKeyCode, describeAndroidTv, isChromecast, parsePairedTv, uuidFromUsn } from "./android-tv-mapping.js";
import type { BackoffOptions } from "./backoff.js";
import { macOf } from "./device-mac.js";
import { LinkRegistry } from "./link-registry.js";

/** The parts of AndroidTvPairing the driver uses (a fake in tests). */
export interface PairingLike {
  finish(code: string): Promise<AndroidTvPairingResult>;
  cancel(): void;
}

export interface AndroidTvDriverOptions {
  search?: (opts: SsdpSearchOptions) => Promise<SsdpReply[]>;
  fetchText?: (url: string) => Promise<string>;
  /** Whether the host accepts TCP on any of the ports. */
  probe?: (ip: string, ports: number[], timeoutMs: number) => Promise<boolean>;
  remote?: (host: string, paired: PairedTv) => RemoteLike;
  pairing?: (host: string, cert: ClientCertificate) => Promise<PairingLike>;
  createCert?: () => ClientCertificate;
  /** The MAC of a host just reached on the LAN (from the ARP table), for Wake-on-LAN. */
  lookupMac?: (ip: string) => Promise<string | undefined>;
  /** Wake-on-LAN. */
  send?: (mac: string) => Promise<void>;
  bindAddress?: string;
  discoveryIntervalMs?: number;
  backoff?: Partial<BackoffOptions>;
}

const DIAL_ST = "urn:dial-multiscreen-org:service:dial:1";
const DISCOVERY_INTERVAL_MS = 60_000;
const SEARCH_TIMEOUT_MS = 3000;
const HTTP_TIMEOUT_MS = 2000;
const PROBE_TIMEOUT_MS = 1000;
const DESC_PORT = 8008;

/** A device description is a few KB; anything larger is not one. */
const MAX_DESC_BYTES = 64 * 1024;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_DESC_BYTES) throw new Error("Device description too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Always the replying IP's own description URL: an SSDP LOCATION is unauthenticated and could point anywhere. */
const descUrl = (ip: string) => `http://${ip}:${DESC_PORT}/ssdp/device-desc.xml`;

const probe = (ip: string, ports: number[], timeoutMs: number) => probeTcp(ip, ports, timeoutMs);

/**
 * Android / Google TVs over Android TV Remote v2. Found by SSDP (Chromecast DIAL replies whose host
 * accepts the remote port); paired by a code the TV shows; one persistent remote connection per TV.
 */
export class AndroidTvDriver implements Driver {
  readonly brand = "ANDROID_TV" as const;
  private readonly links = new LinkRegistry<AndroidTvLink>();
  private ctx: DriverContext | undefined;
  private discoveryTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: AndroidTvDriverOptions = {}) {}

  readonly tv: TvCapability = {
    sendKey: async (device, key) => this.link(device).sendKey(androidKeyCode(key)),
    launchApp: async (device, app) => this.link(device).launch(androidAppLink(app)),
    apps: () => ANDROID_TV_APPS,
    canPowerOn: () => true, // POWER is a key while the TV keeps its remote port open; Wake-on-LAN once it drops off
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
        const paired = parsePairedTv(d.secretPlain);
        if (!paired) {
          ctx.status(d.id, "NEEDS_PAIRING");
          return undefined;
        }
        if (!d.ip) return undefined;
        const ip = d.ip;
        const create = this.opts.remote ?? ((host: string, p: PairedTv) => new AndroidTvRemote(host, p));
        const mac = macOf(d);
        const send = this.opts.send ?? ((m: string) => sendMagicPacket(m));
        const wake = mac ? () => send(mac) : undefined;
        const link = new AndroidTvLink(d.id, () => create(ip, paired), ctx, this.opts.backoff, wake);
        link.start();
        return link;
      },
    );
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    const link = this.link(device);
    if (patch.on !== undefined) await link.setPower(patch.on);
  }

  async discoverNow(): Promise<DiscoveryReport> {
    const ctx = this.context();
    try {
      const search = this.opts.search ?? ssdpSearch;
      const replies = (await search({ st: [DIAL_ST], timeoutMs: SEARCH_TIMEOUT_MS, bindAddress: this.opts.bindAddress })).filter(isChromecast);
      const byIp = new Map(replies.map((r) => [r.ip, r]));
      const found = await Promise.all([...byIp.values()].map((r) => this.describe(r.ip, uuidFromUsn(r.usn))));
      for (const d of found) if (d) ctx.discovered(d);
    } catch (err) {
      ctx.log.warn("android tv: discovery failed", err);
    }
    return { authFailures: 0 };
  }

  identify(ip: string): Promise<Discovered | undefined> {
    return this.describe(ip);
  }

  /**
   * The TV at `ip` when it accepts the remote port and serves a device description; else undefined. Its
   * MAC (for Wake-on-LAN) is read from the ARP table, which the probe just filled.
   */
  private async describe(ip: string, uuid?: string): Promise<Discovered | undefined> {
    try {
      if (!(await (this.opts.probe ?? probe)(ip, [ANDROID_TV_REMOTE_PORT], PROBE_TIMEOUT_MS))) return undefined;
      const tv = describeAndroidTv(ip, await (this.opts.fetchText ?? fetchText)(descUrl(ip)), uuid);
      const mac = tv && (await (this.opts.lookupMac ?? lookupMac)(ip));
      return tv && mac ? { ...tv, config: { mac } } : tv;
    } catch {
      return undefined;
    }
  }

  private async startPairing(device: DeviceRecord): Promise<PairingSession> {
    if (!device.ip) throw new DeviceOfflineError();
    const cert = (this.opts.createCert ?? createClientCertificate)();
    const pairing = await (this.opts.pairing ?? ((host, c) => AndroidTvPairing.start(host, c)))(device.ip, cert);
    return {
      mode: "CODE",
      finish: async (code) => {
        try {
          const { tvCertSha256 } = await pairing.finish(code ?? "");
          return JSON.stringify({ certPem: cert.certPem, keyPem: cert.keyPem, tvCertSha256 } satisfies PairedTv);
        } catch (err) {
          if (err instanceof AndroidTvBadCodeError) throw new WrongPairingCodeError();
          if (err instanceof AndroidTvPairingFailedError) throw new PairingRejectedError();
          throw err;
        }
      },
      cancel: () => pairing.cancel(),
    };
  }

  private link(device: DeviceRecord): AndroidTvLink {
    if (!parsePairedTv(device.secretPlain)) throw new DeviceNotReadyError("NEEDS_PAIRING");
    const link = this.links.get(device.id);
    if (!link) throw new DeviceOfflineError();
    return link;
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("AndroidTvDriver not started");
    return this.ctx;
  }
}
