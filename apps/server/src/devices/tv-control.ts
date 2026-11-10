import { badInput } from "../api-errors.js";
import type { Device } from "../generated/prisma/client.js";
import { deviceNotFound, deviceNotReady } from "./command-errors.js";
import { notReadyReason } from "./command-guard.js";
import { runDeviceCall } from "./command-runner.js";
import type { DeviceRecords } from "./device-records.js";
import { TimeoutError, withTimeout } from "./with-timeout.js";
import type { Brand, DeviceRecord, DriverLog, PairingSession, TvApp, TvCapability, TvKey } from "./types.js";

export type TvInfo = { apps: TvApp[]; canPowerOn: boolean };

export interface TvControlDeps {
  records: DeviceRecords;
  tvFor: (brand: Brand) => TvCapability | undefined;
  log: DriverLog;
  commandTimeoutMs: number;
  /** Called when a TV didn't answer, so its tile shows offline. */
  onUnreachable: (deviceId: string) => void;
  /** Default 10 s. */
  pairingStartTimeoutMs?: number;
}

/** Opening a pairing exchange may need a TLS handshake with a sleepy TV. */
const PAIRING_START_TIMEOUT_MS = 10_000;

/** Remote keys, app launches and pairing for TVs, through the TV's driver. */
export class TvControl {
  constructor(private readonly deps: TvControlDeps) {}

  /** Throws NOT_FOUND, BAD_USER_INPUT (not a TV), DEVICE_NOT_READY or DEVICE_UNREACHABLE. */
  sendKey(deviceId: string, key: TvKey): Promise<void> {
    return this.command(deviceId, (tv, d) => tv.sendKey(d, key));
  }

  launchApp(deviceId: string, app: TvApp): Promise<void> {
    return this.command(deviceId, (tv, d) => tv.launchApp(d, app));
  }

  /** The TV's apps and power-on ability; null for anything that isn't a TV with a driver. */
  info(device: Device): TvInfo | null {
    const tv = device.kind === "TV" ? this.deps.tvFor(device.brand) : undefined;
    if (!tv) return null;
    return { apps: tv.apps(device), canPowerOn: tv.canPowerOn(device) };
  }

  /** Opens a pairing exchange with the TV (whatever its status). One that opens after the timeout is closed. */
  async startPairing(deviceId: string): Promise<PairingSession> {
    const { device, tv } = await this.resolve(deviceId);
    const opening = tv.startPairing(device);
    try {
      return await withTimeout(opening, this.deps.pairingStartTimeoutMs ?? PAIRING_START_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof TimeoutError) void opening.then((late) => late.cancel(), () => undefined);
      throw err;
    }
  }

  private async command(deviceId: string, run: (tv: TvCapability, device: DeviceRecord) => Promise<void>): Promise<void> {
    const { device, tv } = await this.resolve(deviceId);
    const reason = notReadyReason(device);
    if (reason) throw deviceNotReady(deviceId, reason);
    const result = await runDeviceCall(device, () => run(tv, device), this.deps.log, this.deps.commandTimeoutMs);
    if (result.ok) return;
    if (result.unreachable) this.deps.onUnreachable(deviceId);
    throw result.error;
  }

  private async resolve(deviceId: string): Promise<{ device: DeviceRecord; tv: TvCapability }> {
    const device = await this.deps.records.byId(deviceId);
    if (!device) throw deviceNotFound(deviceId);
    const tv = device.kind === "TV" ? this.deps.tvFor(device.brand) : undefined;
    if (!tv) throw badInput("That device isn't a TV");
    return { device, tv };
  }
}
