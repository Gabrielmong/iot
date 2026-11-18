import type { PubSubEngine } from "graphql-subscriptions";
import { badInput } from "../api-errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AdoptedSet } from "./adopted-set.js";
import { computerInfo, type ComputerInfo } from "./computers/computer-info.js";
import { probeSeen } from "./computers/computer-config.js";
import { PowerHistory } from "./computers/power-history.js";
import { WakeTracker } from "./computers/wake-tracker.js";
import { AgentPresence } from "./computers/agent-presence.js";
import { deviceNotFound, deviceNotReady, deviceUnreachable } from "./command-errors.js";
import { assertPatchFits, notReadyReason } from "./command-guard.js";
import { COMMAND_TIMEOUT_MS, runCommand } from "./command-runner.js";
import { deleteDeviceTree } from "./device-removal.js";
import { DeviceRecords } from "./device-records.js";
import { DiscoveryService } from "./discovery-service.js";
import { SerialQueue } from "./serial-queue.js";
import { StateCache } from "./state-cache.js";
import { StatusStore } from "./status-store.js";
import { TrialSet } from "./trial-set.js";
import { TrialStates } from "./trial-states.js";
import { TvControl } from "./tv-control.js";
import { testBlockedReason } from "../services/test-reason.js";
import { DEVICE_STATE, DEVICES_CHANGED, type DeviceStatePayload } from "./topics.js";
import type { Brand, DeviceState, DeviceStatus, Discovered, DiscoveryReport, Driver, DriverContext, DriverLog, StatePatch } from "./types.js";

export interface DeviceManagerOptions {
  log?: DriverLog;
  commandTimeoutMs?: number;
  /** The clock trials expire by (tests move it). */
  now?: () => Date;
}

/** How often expired trials are dropped. */
const TRIAL_SWEEP_MS = 15_000;

/**
 * Orchestrates drivers: feeds them adopted devices, routes their discoveries, states and statuses to
 * the services that persist or cache them, and publishes changes for GraphQL subscriptions.
 * A failing driver is logged and never stops the others.
 */
export class DeviceManager {
  private readonly cache = new StateCache();
  private readonly adopted = new AdoptedSet();
  private readonly discovery: DiscoveryService;
  private readonly statuses: StatusStore;
  private readonly records: DeviceRecords;
  /** Serializes DB writes from driver callbacks (avoids racing creates of the same device). */
  private readonly writes: SerialQueue;
  /** Serializes driver syncs, so each reads the DB and is applied before the next one starts. */
  private readonly syncs: SerialQueue;
  /** Records a PC's On/Off change, then publishes it, so a client that refetches history on the change sees it. */
  private readonly powerChanges: SerialQueue;
  private readonly log: DriverLog;
  private readonly commandTimeoutMs: number;
  private readonly now: () => Date;
  /** Un-adopted devices linked in memory so the admin can test them; never published or persisted. */
  private readonly trials = new TrialSet();
  private readonly trialStates = new TrialStates();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  /** Remote keys, app launches and pairing for TVs. */
  readonly tv: TvControl;
  /** On/Off changes of computers. */
  readonly history: PowerHistory;
  /** Follows each PC's latest wake. */
  readonly wakes: WakeTracker;
  /** PCs whose HomeAgent is connected. */
  private readonly presence = new AgentPresence();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly drivers: Driver[],
    private readonly pubsub: PubSubEngine,
    secretKey: Buffer,
    opts: DeviceManagerOptions = {},
  ) {
    this.log = opts.log ?? console;
    this.commandTimeoutMs = opts.commandTimeoutMs ?? COMMAND_TIMEOUT_MS;
    this.now = opts.now ?? (() => new Date());
    this.discovery = new DiscoveryService(prisma);
    this.statuses = new StatusStore(prisma);
    this.records = new DeviceRecords(prisma, secretKey, this.log);
    this.history = new PowerHistory(prisma, this.now);
    this.wakes = new WakeTracker({ now: () => this.now().getTime(), onChange: (id) => this.publishState(id, this.cache.get(id)) });
    this.writes = new SerialQueue((err) => this.log.error("device manager: write failed", err));
    this.syncs = new SerialQueue((err) => this.log.error("device manager: sync failed", err));
    this.powerChanges = new SerialQueue((err) => this.log.error("device manager: power history write failed", err));
    this.tv = new TvControl({
      records: this.records,
      tvFor: (brand) => this.driverFor(brand)?.tv,
      log: this.log,
      commandTimeoutMs: this.commandTimeoutMs,
      onUnreachable: (deviceId) => this.publishOffline(deviceId),
    });
  }

  async start(): Promise<void> {
    const ctx = this.context();
    await Promise.all(this.drivers.map((d) => this.guard(d, "start", () => d.start(ctx))));
    await this.refresh();
    this.sweepTimer = setInterval(() => void this.sweepTrials(), TRIAL_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  async stop(): Promise<void> {
    clearInterval(this.sweepTimer);
    this.wakes.stopAll();
    await Promise.all(this.drivers.map((d) => this.guard(d, "stop", () => d.stop())));
    await this.idle();
  }

  getState(deviceId: string): DeviceState {
    return this.cache.get(deviceId);
  }

  /** Wake progress, RDP address and confirmability of a PC; null for other devices. */
  computerInfo(row: { id: string; kind: string; ip: string | null; config: unknown; agentTokenHash?: string | null; agentVersion?: number | null }): (ComputerInfo & { deviceId: string }) | null {
    const info = computerInfo(row, this.wakes.get(row.id), this.presence.isUp(row.id));
    return info && { ...info, deviceId: row.id }; // deviceId: for the viewer's permission fields
  }

  /** A PC's HomeAgent connected (the PC is on) or disconnected (off until the probe sees it); always published. */
  agentPresence(deviceId: string, connected: boolean): void {
    if (!this.adopted.has(deviceId)) return;
    this.presence.set(deviceId, connected);
    const before = this.cache.get(deviceId);
    this.onState(deviceId, { ...before, online: true, on: connected }, "AGENT");
    if (this.cache.get(deviceId) === before) this.publishState(deviceId, before); // only `computer.agent` changed
  }

  /** Throws GraphQLError with code DEVICE_UNREACHABLE, DEVICE_NOT_READY or NOT_FOUND. */
  async setState(deviceId: string, patch: StatePatch): Promise<void> {
    const device = await this.records.byId(deviceId);
    if (!device) throw deviceNotFound(deviceId);
    const reason = notReadyReason(device);
    if (reason) throw deviceNotReady(deviceId, reason);
    assertPatchFits(device, patch);
    const driver = this.driverFor(device.brand);
    if (!driver) throw deviceNotReady(deviceId, `no driver for ${device.brand}`);

    const alreadyOn = this.cache.get(deviceId).on === true;
    const result = await runCommand(driver, device, patch, this.log, this.commandTimeoutMs);
    if (result.ok) {
      if (device.kind === "COMPUTER" && patch.on === true) {
        const agent = !!device.agentTokenHash;
        this.wakes.start(deviceId, { hasIp: !!device.ip || agent, confirmable: probeSeen(device) || agent, alreadyOn });
      }
      return;
    }
    if (result.unreachable) this.publishOffline(deviceId);
    throw result.error;
  }

  /**
   * Links an un-adopted device in memory so the admin can switch it to identify it, and returns its
   * state once the driver reports one. Throws BAD_USER_INPUT for adopted devices and for devices that
   * can't be tested (the reason is the message), and DEVICE_UNREACHABLE (ending the trial) when the
   * device doesn't answer within the command timeout.
   */
  async startTrial(deviceId: string): Promise<DeviceState> {
    const device = await this.trialCandidate(deviceId);
    this.trials.touch(deviceId, device.brand, this.now());
    const driver = this.driverFor(device.brand);
    if (driver) await this.syncDriver(driver);
    const state = await this.trialStates.wait(deviceId, this.commandTimeoutMs);
    if (state.online) return state;
    await this.endTrial(deviceId);
    throw deviceUnreachable(deviceId);
  }

  /** Switches a device on trial; renews the trial. Throws BAD_USER_INPUT when no trial is running. */
  async setTrialState(deviceId: string, on: boolean): Promise<DeviceState> {
    if (!this.trials.has(deviceId)) throw badInput("No test running for this device");
    const device = await this.records.byId(deviceId);
    const driver = device && this.driverFor(device.brand);
    if (!device || !driver) throw deviceNotFound(deviceId);
    this.trials.touch(deviceId, device.brand, this.now());
    const result = await runCommand(driver, device, { on }, this.log, this.commandTimeoutMs);
    if (!result.ok) throw result.error;
    this.trialStates.set(deviceId, { ...this.trialStates.get(deviceId), online: true, on });
    return this.trialStates.get(deviceId);
  }

  /** Drops a trial link (no-op when none is running). */
  async endTrial(deviceId: string): Promise<void> {
    if (!this.trials.has(deviceId)) return;
    const device = await this.records.byId(deviceId);
    this.trials.remove(deviceId);
    this.trialStates.delete(deviceId);
    const driver = device && this.driverFor(device.brand);
    if (driver) await this.syncDriver(driver);
  }

  /** Ends trials unused for two minutes (runs on a timer; tests call it directly). Never rejects. */
  async sweepTrials(): Promise<void> {
    for (const id of this.trials.expired(this.now())) {
      try {
        await this.endTrial(id);
      } catch (err) {
        this.log.error(`device manager: ending trial ${id} failed`, err);
      }
    }
  }

  /** Re-syncs every driver with the adopted devices (after adopt, remove or a key change). */
  async refresh(): Promise<void> {
    for (const driver of this.drivers) await this.syncDriver(driver);
    this.cache.retain(this.adopted.all());
  }

  /** Runs a brand's on-demand discovery (if it has one) and waits until what it found is recorded. */
  async discoverNow(brand: Brand): Promise<DiscoveryReport> {
    const driver = this.driverFor(brand);
    let report: DiscoveryReport = { authFailures: 0 };
    if (driver?.discoverNow) {
      const run = driver.discoverNow.bind(driver);
      await this.guard(driver, "discoverNow", async () => {
        report = await run();
      });
    }
    await this.writes.idle();
    return report;
  }

  /** Deletes a device with its child devices and grants, then re-syncs the drivers. */
  async removeDevice(deviceId: string): Promise<void> {
    const ids = await deleteDeviceTree(this.prisma, deviceId);
    this.adopted.remove(ids);
    for (const id of ids) this.trials.remove(id);
    for (const id of ids) this.wakes.cancel(id);
    for (const id of ids) this.presence.forget(id);
    this.cache.retain(this.adopted.all());
    for (const id of ids) this.statuses.forget(id);
    this.discovery.forgetSightings();
    await this.publishChanged();
    await this.refresh();
  }

  /** The device the first of `brands`' drivers recognises at `ip` (asked in order), or undefined. */
  async identifyAt(ip: string, brands: readonly Brand[]): Promise<Discovered | undefined> {
    for (const brand of brands) {
      try {
        const found = await this.driverFor(brand)?.identify?.(ip);
        if (found) return found;
      } catch (err) {
        this.log.warn(`${brand}: identify ${ip} failed`, err);
      }
    }
    return undefined;
  }

  /** Records a device found outside driver discovery (Kasa add-by-IP); resolves once it is written. */
  recordDiscovered(d: Discovered): Promise<void> {
    return this.writes.run(() => this.onDiscovered(d));
  }

  /**
   * Runs a device read-modify-write in the same queue as discovery writes, so a concurrent discovery
   * merge of `config` cannot overwrite it (or be overwritten by it).
   */
  runDeviceWrite<T>(task: () => Promise<T>): Promise<T> {
    return this.writes.run(task);
  }

  /** The config a device announced in its latest LAN sighting (e.g. the Tuya protocol version). */
  observedConfig(brand: Brand, externalId: string): Record<string, unknown> | undefined {
    return this.discovery.observedConfig(brand, externalId);
  }

  /** Resolves once queued discovery/status writes and syncs are done. */
  async idle(): Promise<void> {
    await this.writes.idle();
    await this.syncs.idle();
    await this.powerChanges.idle();
  }

  private context(): DriverContext {
    return {
      discovered: (d) => this.writes.push(() => this.onDiscovered(d)),
      state: (deviceId, s) => this.onState(deviceId, s),
      status: (deviceId, status) => this.writes.push(() => this.onStatus(deviceId, status)),
      log: this.log,
    };
  }

  private async onDiscovered(d: Discovered): Promise<void> {
    const outcome = await this.discovery.record(d);
    if (outcome.created) await this.publishChanged();
    const driver = this.driverFor(d.brand);
    if (outcome.ipChanged && driver) await this.syncDriver(driver);
  }

  private onState(deviceId: string, reported: DeviceState, from: "DRIVER" | "AGENT" = "DRIVER"): void {
    if (!this.adopted.has(deviceId)) {
      if (this.trials.has(deviceId)) this.trialStates.set(deviceId, reported);
      return; // otherwise a late report from a stopped link, or a removed device
    }
    const before = this.cache.get(deviceId).on;
    const state = from === "DRIVER" ? this.presence.adjust(deviceId, reported, before) : reported;
    const changed = this.cache.set(deviceId, state);
    const waking = this.wakes.get(deviceId)?.status === "WAKING";
    if (state.on === true) this.wakes.sawOn(deviceId);
    if (!changed) return;
    if (this.adopted.brandOf(deviceId) === "WOL" && typeof state.on === "boolean" && state.on !== before) {
      const on = state.on;
      const source = from === "AGENT" ? "AGENT" : on && waking ? "WAKE" : "PROBE";
      this.powerChanges.push(async () => {
        try {
          await this.history.record(deviceId, on, source);
        } finally {
          this.publishState(deviceId, this.cache.get(deviceId));
        }
      });
      return;
    }
    this.publishState(deviceId, state);
  }

  private async onStatus(deviceId: string, status: DeviceStatus): Promise<void> {
    if (!this.adopted.has(deviceId)) return;
    if (await this.statuses.set(deviceId, status)) await this.publishChanged();
  }

  /** Queued: reads the adopted devices and applies them to the driver before any later sync reads. */
  private syncDriver(driver: Driver): Promise<void> {
    return this.syncs.run(async () => {
      const devices = await this.records.adopted(driver.brand);
      const ids = devices.map((d) => d.id);
      this.adopted.replace(driver.brand, ids);
      for (const id of ids) this.statuses.forget(id); // the DB may have changed (e.g. a new key)
      const onTrial = await this.trialRecords(driver.brand, new Set(ids));
      await this.guard(driver, "sync", () => driver.sync([...devices, ...onTrial]));
    });
  }

  /**
   * Records of the brand's devices on trial. Trials of devices adopted meanwhile end: they are linked as
   * adopted, keeping the trial's last state (a link that is kept may not report again until something changes).
   */
  private async trialRecords(brand: Brand, adoptedIds: Set<string>) {
    for (const id of this.trials.ids(brand)) {
      if (!adoptedIds.has(id)) continue;
      if (this.trialStates.has(id)) {
        const state = this.trialStates.get(id);
        if (this.cache.set(id, state)) this.publishState(id, state);
      }
      this.trials.remove(id);
      this.trialStates.delete(id);
    }
    const ids = this.trials.ids(brand);
    return ids.length === 0 ? [] : (await this.records.byIds(ids)).filter((d) => !d.adopted);
  }

  private async trialCandidate(deviceId: string) {
    const device = await this.records.byId(deviceId);
    if (!device) throw deviceNotFound(deviceId);
    if (device.adopted) throw badInput("Device is already adopted");
    const reason = testBlockedReason(device, this.now());
    if (reason) throw badInput(reason);
    return device;
  }

  private async guard(driver: Driver, what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.log.error(`device manager: ${driver.brand} driver ${what} failed`, err);
    }
  }

  private driverFor(brand: Brand): Driver | undefined {
    return this.drivers.find((d) => d.brand === brand);
  }

  /** Always published, even if the cache already said offline: the caller just learned it first-hand. */
  private publishOffline(deviceId: string): void {
    this.publishState(deviceId, this.cache.markOffline(deviceId));
  }

  private publishState(deviceId: string, state: DeviceState): void {
    const payload: DeviceStatePayload = { deviceId, state };
    this.pubsub.publish(DEVICE_STATE, payload).catch((err: unknown) => this.log.error("publish failed", err));
  }

  private publishChanged(): Promise<void> {
    return this.pubsub.publish(DEVICES_CHANGED, {});
  }
}
