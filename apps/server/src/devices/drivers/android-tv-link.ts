import type { EventEmitter } from "node:events";
import { DeviceOfflineError } from "../errors.js";
import type { DriverContext } from "../types.js";
import { AndroidTvNotPairedError, CertificateMismatchError } from "@home/protocols";
import type { BackoffOptions, FailureKind } from "./backoff.js";
import { Reconnector } from "./reconnector.js";

/** The parts of AndroidTvRemote a link uses (a fake in tests). */
export interface RemoteLike extends EventEmitter {
  connect(): Promise<void>;
  sendKey(keyCode: number): void;
  launch(appLink: string): void;
  close(): void;
}

const POWER_KEY = 26;

/**
 * The persistent remote connection to one paired Android TV: follows its power state, sends keys, and
 * reconnects with backoff after any drop.
 */
export class AndroidTvLink {
  private remote: RemoteLike | undefined;
  private connected = false;
  private stopped = false;
  private power: boolean | undefined;
  private readonly reconnector: Reconnector;

  constructor(
    private readonly deviceId: string,
    private readonly create: () => RemoteLike,
    private readonly ctx: DriverContext,
    backoff?: Partial<BackoffOptions>,
  ) {
    this.reconnector = new Reconnector(() => void this.connect(), backoff);
  }

  start(): void {
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.reconnector.cancel();
    const remote = this.remote;
    this.remote = undefined;
    if (remote) dispose(remote);
  }

  sendKey(keyCode: number): void {
    this.live().sendKey(keyCode);
  }

  launch(appLink: string): void {
    this.live().launch(appLink);
  }

  /** Presses POWER only when the TV's reported state differs, so repeating a request is harmless. */
  setPower(on: boolean): void {
    const remote = this.live();
    if (this.power === on) return;
    remote.sendKey(POWER_KEY);
    this.power = on;
    this.publish();
  }

  private live(): RemoteLike {
    if (!this.remote || !this.connected) throw new DeviceOfflineError();
    return this.remote;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const remote = this.create();
    this.remote = remote;
    this.connected = false;
    remote.on("error", () => undefined); // failures surface as a rejected connect or 'disconnected'
    remote.on("power", (on: boolean) => {
      if (this.remote !== remote) return;
      this.power = on;
      this.publish();
    });
    remote.on("disconnected", () => this.fail(remote));
    try {
      await remote.connect();
      if (this.remote !== remote) return;
      this.connected = true;
      this.reconnector.connected();
      this.ctx.status(this.deviceId, "OK");
      this.publish();
    } catch (err) {
      this.ctx.log.warn(`android tv ${this.deviceId}: cannot connect: ${err instanceof Error ? err.message : String(err)}`);
      // Another certificate means another TV (or a reset one), and a refused certificate means the pairing
      // was removed on the TV: either way it must be paired again.
      const unpaired = err instanceof CertificateMismatchError || err instanceof AndroidTvNotPairedError;
      if (unpaired) this.ctx.status(this.deviceId, "NEEDS_PAIRING");
      this.fail(remote, unpaired ? "auth" : "transient");
    }
  }

  private fail(remote: RemoteLike, kind: FailureKind = "transient"): void {
    if (this.remote !== remote) return;
    this.remote = undefined;
    this.connected = false;
    this.power = undefined;
    dispose(remote);
    this.ctx.state(this.deviceId, { online: false });
    if (!this.stopped) this.reconnector.failed(kind);
  }

  private publish(): void {
    this.ctx.state(this.deviceId, this.power === undefined ? { online: true } : { online: true, on: this.power });
  }
}

function dispose(remote: RemoteLike): void {
  remote.removeAllListeners();
  remote.on("error", () => undefined);
  remote.close();
}
