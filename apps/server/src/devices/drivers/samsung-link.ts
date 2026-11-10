import type { EventEmitter } from "node:events";
import { CertificateMismatchError, SamsungUnauthorizedError, type SamsungInfo, type SamsungPaired } from "@home/protocols";
import { DeviceNotReadyError } from "../errors.js";
import type { DriverContext } from "../types.js";
import { Poller } from "./poller.js";

/** The parts of SamsungRemote a link uses (a fake in tests). */
export interface SamsungRemoteLike extends EventEmitter {
  readonly isOpen: boolean;
  sendKey(key: string): void;
  launch(appId: string): void;
  close(): void;
}

export interface SamsungLinkDeps {
  fetchInfo: (ip: string) => Promise<SamsungInfo>;
  send: (mac: string) => Promise<void>;
  connect: (host: string, paired: SamsungPaired) => Promise<SamsungRemoteLike>;
  pollIntervalMs: number;
}

export interface SamsungTarget {
  deviceId: string;
  ip: string;
  mac: string | undefined;
  paired: SamsungPaired;
}

/** On when /api/v2/ answers without saying standby; older models drop off the network in standby. */
const isOn = (info: SamsungInfo) => info.powerState === undefined || info.powerState === "on";

/**
 * One paired Samsung TV: polls /api/v2/ for power, opens the remote channel when a key is sent (and
 * keeps it while the TV keeps it), and wakes the TV by Wake-on-LAN.
 */
export class SamsungLink {
  private power: boolean | undefined;
  private remote: SamsungRemoteLike | undefined;
  private connecting: Promise<SamsungRemoteLike> | undefined;
  private readonly poller: Poller;

  constructor(
    private readonly target: SamsungTarget,
    private readonly deps: SamsungLinkDeps,
    private readonly ctx: DriverContext,
  ) {
    this.poller = new Poller(() => this.poll(), () => "transient", { intervalMs: deps.pollIntervalMs });
  }

  start(): void {
    this.poller.start();
  }

  stop(): void {
    this.poller.stop();
    this.remote?.close();
    this.remote = undefined;
  }

  async setPower(on: boolean): Promise<void> {
    if (on) {
      if (this.power === true) return;
      if (!this.target.mac) throw new DeviceNotReadyError("this TV can't be turned on from the app");
      await this.deps.send(this.target.mac);
      this.poller.pollNow();
      return;
    }
    if (this.power !== true) return;
    await this.key("KEY_POWER");
    this.power = false;
    this.publish();
  }

  async key(key: string): Promise<void> {
    (await this.channel()).sendKey(key);
  }

  async launch(appId: string): Promise<void> {
    (await this.channel()).launch(appId);
  }

  private async poll(): Promise<void> {
    try {
      this.power = isOn(await this.deps.fetchInfo(this.target.ip));
    } catch {
      this.power = false;
    }
    this.publish();
  }

  private channel(): Promise<SamsungRemoteLike> {
    if (this.remote?.isOpen) return Promise.resolve(this.remote);
    this.connecting ??= this.deps
      .connect(this.target.ip, this.target.paired)
      .then((remote) => {
        this.remote = remote;
        remote.on("disconnected", () => {
          if (this.remote === remote) this.remote = undefined;
        });
        return remote;
      })
      .catch((err: unknown) => {
        if (err instanceof SamsungUnauthorizedError || err instanceof CertificateMismatchError) {
          this.ctx.status(this.target.deviceId, "NEEDS_PAIRING");
          throw new DeviceNotReadyError("NEEDS_PAIRING");
        }
        throw err;
      })
      .finally(() => {
        this.connecting = undefined;
      });
    return this.connecting;
  }

  private publish(): void {
    this.ctx.state(this.target.deviceId, { online: true, on: this.power ?? false });
  }
}
