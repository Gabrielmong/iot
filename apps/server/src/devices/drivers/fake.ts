import type { Brand, DeviceRecord, DeviceState, DeviceStatus, Discovered, DiscoveryReport, Driver, DriverContext, StatePatch } from "../types.js";

/** An in-memory driver for tests: records what the manager asks and lets the test report back. */
export class FakeDriver implements Driver {
  started = false;
  /** Every device list applied by sync(), in order (recorded when sync finishes). */
  readonly synced: DeviceRecord[][] = [];
  /** Every successful setState() call, in order. */
  readonly commands: { deviceId: string; patch: StatePatch }[] = [];
  /** Runs before start/sync finish (e.g. to delay or fail them). */
  startImpl?: () => Promise<void>;
  syncImpl?: (devices: DeviceRecord[]) => Promise<void>;
  /** Overrides setState (e.g. to hang or fail). */
  setStateImpl?: (device: DeviceRecord, patch: StatePatch) => Promise<void>;
  /** What discoverNow() resolves with, and how often it was called. */
  discoverNowReport: DiscoveryReport = { authFailures: 0 };
  discoverNowCalls = 0;
  private ctx: DriverContext | undefined;

  constructor(readonly brand: Brand) {}

  async start(ctx: DriverContext): Promise<void> {
    this.ctx = ctx;
    if (this.startImpl) await this.startImpl();
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async sync(devices: DeviceRecord[]): Promise<void> {
    if (this.syncImpl) await this.syncImpl(devices);
    this.synced.push(devices);
  }

  async setState(device: DeviceRecord, patch: StatePatch): Promise<void> {
    if (this.setStateImpl) await this.setStateImpl(device, patch);
    this.commands.push({ deviceId: device.id, patch });
  }

  async discoverNow(): Promise<DiscoveryReport> {
    this.discoverNowCalls++;
    return this.discoverNowReport;
  }

  discover(d: Discovered): void {
    this.context().discovered(d);
  }

  pushState(deviceId: string, state: DeviceState): void {
    this.context().state(deviceId, state);
  }

  reportStatus(deviceId: string, status: DeviceStatus): void {
    this.context().status(deviceId, status);
  }

  private context(): DriverContext {
    if (!this.ctx) throw new Error("FakeDriver not started");
    return this.ctx;
  }
}
