import type { PubSubEngine } from "graphql-subscriptions";
import { randomUUID } from "node:crypto";
import { coded } from "../api-errors.js";
import type { AgentHub } from "./hub.js";
import type { AgentMessage, PowerAction } from "./protocol.js";

export const PC_POWER = "PC_POWER";
/** How long the PC's prompt counts down before acting (when someone is signed in and unlocked). */
export const POWER_COUNTDOWN_S = 60;
/** Requests are remembered this long, so late agent reports still name the action and requester. */
const KEEP_MS = 10 * 60_000;

export type PcPowerAction = "SLEEP" | "SHUTDOWN" | "RESTART";
export type PcPowerPhase = "SENT" | "COUNTDOWN" | "CANCELLED" | "EXECUTING" | "SKIPPED";
export type PcPowerState = { id: string; deviceId: string; action: PcPowerAction; phase: PcPowerPhase; secondsLeft: number | null; requestedBy: string };

const WIRE: Record<PcPowerAction, PowerAction> = { SLEEP: "sleep", SHUTDOWN: "shutdown", RESTART: "restart" };

/** Sends power requests to PCs' agents and publishes what the agents report back (PC_POWER). */
export class PcPowerRelay {
  private readonly requests = new Map<string, { deviceId: string; action: PcPowerAction; requestedBy: string; at: number }>();

  constructor(
    private readonly agents: AgentHub,
    private readonly pubsub: PubSubEngine,
    private readonly now: () => Date,
  ) {
    agents.on("message", (deviceId, msg) => this.onMessage(deviceId, msg));
  }

  /** Throws DEVICE_UNREACHABLE when the PC's agent isn't connected. */
  request(deviceId: string, action: PcPowerAction, requestedBy: string): PcPowerState {
    const id = randomUUID();
    if (!this.agents.send(deviceId, { t: "power", id, action: WIRE[action], requestedBy, seconds: POWER_COUNTDOWN_S })) {
      throw coded("DEVICE_UNREACHABLE", "The PC's agent isn't connected");
    }
    this.prune();
    this.requests.set(id, { deviceId, action, requestedBy, at: this.now().getTime() });
    return { id, deviceId, action, phase: "SENT", secondsLeft: null, requestedBy };
  }

  /** Asks the agent to cancel a countdown; false when the agent isn't connected. */
  cancel(deviceId: string, id: string): boolean {
    return this.agents.send(deviceId, { t: "power.cancel", id });
  }

  private onMessage(deviceId: string, msg: AgentMessage): void {
    if (msg.t !== "power.state") return;
    const req = this.requests.get(msg.id);
    if (!req || req.deviceId !== deviceId) return; // only requests this server sent to this PC
    const state: PcPowerState = {
      id: msg.id,
      deviceId,
      action: req.action,
      phase: msg.phase.toUpperCase() as PcPowerPhase,
      secondsLeft: msg.secondsLeft ?? null,
      requestedBy: req.requestedBy,
    };
    void this.pubsub.publish(PC_POWER, state);
  }

  private prune(): void {
    const cutoff = this.now().getTime() - KEEP_MS;
    for (const [id, r] of this.requests) if (r.at < cutoff) this.requests.delete(id);
  }
}
