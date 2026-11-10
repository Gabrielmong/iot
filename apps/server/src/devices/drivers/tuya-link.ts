import { TuyaClient, TuyaKeyError } from "@home/protocols";
import { DeviceOfflineError } from "../errors.js";
import type { DriverContext, StatePatch } from "../types.js";
import type { BackoffOptions } from "./backoff.js";
import { Reconnector } from "./reconnector.js";
import { dpsToDeviceState, patchToDps } from "./tuya-mapping.js";
import type { TuyaTarget } from "./tuya-target.js";

export interface TuyaLinkOptions {
  /** TCP port override (tests). */
  port?: number;
  timeoutMs: number;
  backoff?: Partial<BackoffOptions>;
}

/**
 * The persistent connection to one Tuya device: connects, reads and follows its dps, and reconnects
 * with backoff after any drop (routine on 3.5, where a request timeout drops the connection). A wrong
 * key reports KEY_INVALID and is retried at most once per 60 s.
 */
export class TuyaLink {
  private client: TuyaClient | undefined;
  private connected = false;
  private stopped = false;
  private dps: Record<string, unknown> = {};
  private readonly reconnector: Reconnector;

  constructor(
    private readonly target: TuyaTarget,
    private readonly ctx: DriverContext,
    private readonly opts: TuyaLinkOptions,
  ) {
    this.reconnector = new Reconnector(() => void this.connect(), opts.backoff);
  }

  start(): void {
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.reconnector.cancel();
    const client = this.client;
    this.client = undefined;
    if (client) dispose(client);
  }

  async setState(patch: StatePatch): Promise<void> {
    const client = this.client;
    if (!client || !this.connected) throw new DeviceOfflineError();
    const dps = patchToDps(this.target.kind, patch, this.dps, this.target.dpSchema);
    if (Object.keys(dps).length === 0) return;
    try {
      await client.setDps(dps);
    } catch (err) {
      // A key error drops the connection itself. Any other failure (timeout, bad frame) would leave a
      // silent link that never republishes online:true, so drop it and let the reconnect report back.
      if (!(err instanceof TuyaKeyError)) this.fail(client, false);
      throw err;
    }
    // The STATUS push often trails the ack; publish what the device accepted (a later STATUS corrects drift).
    if (this.client !== client) return;
    this.dps = { ...this.dps, ...dps };
    this.publish(true);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const { deviceId, ip, externalId, localKey, version } = this.target;
    let client: TuyaClient;
    try {
      client = new TuyaClient({ ip, id: externalId, localKey, version, port: this.opts.port, timeoutMs: this.opts.timeoutMs });
    } catch (err) {
      // A malformed key (not 16 bytes) will not start working on retry; a key change re-syncs us.
      this.ctx.log.warn(`tuya ${deviceId}: ${String(err)}`);
      this.ctx.status(deviceId, "KEY_INVALID");
      return;
    }
    this.client = client;
    this.connected = false;
    let keyError = false;
    client.on("error", (err) => {
      if (err instanceof TuyaKeyError) keyError = true;
    });
    client.on("dps", (dps) => this.onDps(client, dps));
    client.on("disconnected", () => this.fail(client, keyError));

    try {
      await client.connect();
      const dps = await client.getDps();
      if (this.client !== client) return;
      this.connected = true;
      this.reconnector.connected();
      this.dps = { ...dps };
      this.ctx.status(deviceId, "OK");
      this.publish(true);
    } catch (err) {
      this.fail(client, keyError || err instanceof TuyaKeyError);
    }
  }

  private onDps(client: TuyaClient, dps: Record<string, unknown>): void {
    if (this.client !== client || !this.connected) return;
    this.dps = { ...this.dps, ...dps };
    this.publish(true);
  }

  /** Handles the first failure of `client` (a failed connect and its 'disconnected' must not schedule twice). */
  private fail(client: TuyaClient, keyInvalid: boolean): void {
    if (this.client !== client) return;
    this.client = undefined;
    this.connected = false;
    dispose(client);
    if (keyInvalid) this.ctx.status(this.target.deviceId, "KEY_INVALID");
    this.publish(false);
    if (!this.stopped) this.reconnector.failed(keyInvalid ? "auth" : "transient");
  }

  private publish(online: boolean): void {
    const { deviceId, kind, dpSchema } = this.target;
    this.ctx.state(deviceId, dpsToDeviceState(kind, this.dps, online, dpSchema));
  }
}

function dispose(client: TuyaClient): void {
  client.removeAllListeners();
  client.on("error", () => {}); // late errors from a closing client are irrelevant
  client.close();
}
