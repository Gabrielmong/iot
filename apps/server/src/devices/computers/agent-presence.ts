import type { DeviceState } from "../types.js";

/**
 * Which PCs' HomeAgents are connected. A connected agent means the PC is on, whatever the port probe says;
 * once an agent has been seen, a probe that can't tell (no `on`) keeps the last known On/Off instead of
 * making the PC "unknown" again (the agent's disconnect already said Off).
 */
export class AgentPresence {
  private readonly up = new Set<string>();
  private readonly known = new Set<string>();

  set(deviceId: string, connected: boolean): void {
    this.known.add(deviceId);
    if (connected) this.up.add(deviceId);
    else this.up.delete(deviceId);
  }

  isUp(deviceId: string): boolean {
    return this.up.has(deviceId);
  }

  /** A probe report as the agent's presence shapes it. */
  adjust(deviceId: string, reported: DeviceState, before: boolean | undefined): DeviceState {
    if (this.up.has(deviceId)) return { ...reported, on: true };
    if (this.known.has(deviceId) && reported.on === undefined && before !== undefined) return { ...reported, on: before };
    return reported;
  }

  forget(deviceId: string): void {
    this.up.delete(deviceId);
    this.known.delete(deviceId);
  }
}
