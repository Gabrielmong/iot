import type { DeviceState } from "./types.js";

const UNKNOWN: DeviceState = { online: false };

/**
 * Last state reported for each device on trial. Kept apart from the adopted-device cache so a trial is
 * never published to dashboards. `wait` resolves once a report arrives (or after `ms`).
 */
export class TrialStates {
  private readonly states = new Map<string, DeviceState>();
  private readonly waiters = new Map<string, (() => void)[]>();

  set(id: string, state: DeviceState): void {
    this.states.set(id, state);
    for (const wake of this.waiters.get(id) ?? []) wake();
    this.waiters.delete(id);
  }

  /** Whether the device on trial has reported a state yet. */
  has(id: string): boolean {
    return this.states.has(id);
  }

  get(id: string): DeviceState {
    return this.states.get(id) ?? UNKNOWN;
  }

  delete(id: string): void {
    this.states.delete(id);
  }

  /** Resolves when `id` has a reported state, or after `ms` without one. */
  async wait(id: string, ms: number): Promise<DeviceState> {
    if (this.states.has(id)) return this.get(id);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), () => (clearTimeout(timer), resolve())]);
    });
    return this.get(id);
  }
}
