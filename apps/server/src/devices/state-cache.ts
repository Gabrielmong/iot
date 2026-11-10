import { isDeepStrictEqual } from "node:util";
import type { DeviceState } from "./types.js";

const UNKNOWN: DeviceState = { online: false };

/** Last known live state per device id. */
export class StateCache {
  private readonly states = new Map<string, DeviceState>();

  get(deviceId: string): DeviceState {
    return this.states.get(deviceId) ?? UNKNOWN;
  }

  /** Stores the state; returns false when it equals the cached one. */
  set(deviceId: string, state: DeviceState): boolean {
    if (isDeepStrictEqual(this.states.get(deviceId), state)) return false;
    this.states.set(deviceId, state);
    return true;
  }

  /** Keeps the last readings but marks the device offline, and returns the new state. */
  markOffline(deviceId: string): DeviceState {
    const next = { ...this.get(deviceId), online: false };
    this.set(deviceId, next);
    return next;
  }

  /** Forgets devices not in `ids`. */
  retain(ids: ReadonlySet<string>): void {
    for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id);
  }
}
