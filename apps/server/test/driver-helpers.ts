import type { DeviceRecord, DeviceState, DeviceStatus, Discovered, DriverContext } from "../src/devices/types.js";

export interface RecordingContext extends DriverContext {
  readonly discoveredDevices: Discovered[];
  readonly states: { deviceId: string; state: DeviceState }[];
  readonly statuses: { deviceId: string; status: DeviceStatus }[];
  lastState(deviceId: string): DeviceState | undefined;
  /** Resolves on the next status report. */
  waitForStatus(): Promise<void>;
}

/** A DriverContext that records every call, for driver tests. */
export function recordingContext(): RecordingContext {
  const discoveredDevices: Discovered[] = [];
  const states: { deviceId: string; state: DeviceState }[] = [];
  const statuses: { deviceId: string; status: DeviceStatus }[] = [];
  let waiters: (() => void)[] = [];
  return {
    discovered: (d) => void discoveredDevices.push(d),
    discoveredDevices,
    states,
    statuses,
    state: (deviceId, state) => void states.push({ deviceId, state }),
    status: (deviceId, status) => {
      statuses.push({ deviceId, status });
      const ready = waiters;
      waiters = [];
      for (const w of ready) w();
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    lastState: (deviceId) => states.filter((s) => s.deviceId === deviceId).at(-1)?.state,
    waitForStatus: () => new Promise<void>((resolve) => waiters.push(resolve)),
  };
}

let nextId = 0;

/** A DeviceRecord with sensible defaults. */
export function record(over: Partial<DeviceRecord>): DeviceRecord {
  nextId++;
  return {
    id: `dev-${nextId}`,
    brand: "TUYA",
    kind: "LIGHT",
    externalId: `ext-${nextId}`,
    name: "Device",
    model: null,
    ip: null,
    adopted: true,
    roomId: null,
    parentId: null,
    config: {},
    secret: null,
    status: "OK",
    lastSeenAt: null,
    ...over,
  };
}
