import type { GoveeLan, LightState } from "@home/protocols";
import { DeviceOfflineError } from "../errors.js";
import type { DriverContext, StatePatch } from "../types.js";
import { applyPatch, goveeCommands, type GoveeCommand } from "./govee-mapping.js";
import { Poller } from "./poller.js";

export type GoveeLanEvent = "device" | "socketError" | "scanError";
export type GoveeLanListener = (...args: any[]) => void;

/** The GoveeLan surface the driver uses (a stub in tests). */
export type GoveeLanPort = Pick<GoveeLan, "start" | "stop" | "scan" | "status" | "setOn" | "setBrightness" | "setColor" | "setColorTemp"> & {
  on(event: GoveeLanEvent, listener: GoveeLanListener): unknown;
  off(event: GoveeLanEvent, listener: GoveeLanListener): unknown;
};

/** Polls one Govee light's status and sends it commands. */
export class GoveeLink {
  private readonly poller: Poller;
  private light: LightState | undefined;
  /** Govee commands are fire-and-forget UDP, so reachability comes from the last status poll. */
  private online = false;
  /** A poll in flight when stop() runs must not report for a device that may be gone. */
  private stopped = false;

  constructor(
    private readonly deviceId: string,
    readonly ip: string,
    private readonly lan: GoveeLanPort,
    private readonly ctx: DriverContext,
    pollIntervalMs: number,
  ) {
    this.poller = new Poller(() => this.poll(), () => this.onPollError(), { intervalMs: pollIntervalMs });
  }

  start(): void {
    this.poller.start();
  }

  stop(): void {
    this.stopped = true;
    this.poller.stop();
  }

  async setState(patch: StatePatch): Promise<void> {
    if (!this.online) throw new DeviceOfflineError();
    for (const cmd of goveeCommands(patch)) await this.send(cmd);
    if (this.light) this.publish(applyPatch(this.light, patch));
  }

  private send(cmd: GoveeCommand): Promise<void> {
    switch (cmd.type) {
      case "on":
        return this.lan.setOn(this.ip, cmd.on);
      case "brightness":
        return this.lan.setBrightness(this.ip, cmd.pct);
      case "color":
        return this.lan.setColor(this.ip, cmd.rgb);
      case "colorTemp":
        return this.lan.setColorTemp(this.ip, cmd.kelvin);
    }
  }

  private async poll(): Promise<void> {
    const light = await this.lan.status(this.ip);
    if (this.stopped) return;
    this.publish(light);
    this.ctx.status(this.deviceId, "OK");
  }

  private onPollError(): "transient" {
    this.online = false;
    if (this.stopped) return "transient";
    this.ctx.state(this.deviceId, this.light ? { online: false, light: this.light } : { online: false });
    return "transient";
  }

  private publish(light: LightState): void {
    this.online = true;
    this.light = light;
    this.ctx.state(this.deviceId, { online: true, light });
  }
}
