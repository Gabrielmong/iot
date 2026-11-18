import type { PubSubEngine } from "graphql-subscriptions";
import type { AgentHub } from "./hub.js";
import type { Stats } from "./protocol.js";

export const PC_STATS = "PC_STATS";
export const STATS_INTERVAL_MS = 2000;
export type PcStatsPayload = { deviceId: string; stats: Omit<Stats, "t"> };

/**
 * Asks a PC's agent for stats only while someone watches: `stats.start` on the first watcher (and again
 * when the agent reconnects or a new connection replaces its old one), `stats.stop` `stopDelayMs` after the
 * last one leaves. Samples are relayed on PC_STATS and never stored.
 */
export class StatsBroker {
  private readonly watchers = new Map<string, number>();
  private readonly stopTimers = new Map<string, NodeJS.Timeout>();
  private readonly stopDelayMs: number;

  constructor(
    private readonly agents: AgentHub,
    private readonly pubsub: PubSubEngine,
    opts: { stopDelayMs?: number } = {},
  ) {
    this.stopDelayMs = opts.stopDelayMs ?? 10_000;
    const restart = (id: string) => {
      if ((this.watchers.get(id) ?? 0) > 0) this.start(id);
    };
    agents.on("connected", restart);
    agents.on("replaced", restart);
    agents.on("message", (deviceId, msg) => {
      if (msg.t !== "stats") return;
      const { t: _t, ...stats } = msg;
      void this.pubsub.publish(PC_STATS, { deviceId, stats } satisfies PcStatsPayload);
    });
  }

  /** Registers a watcher; returns its release (safe to call more than once). */
  watch(deviceId: string): () => void {
    const count = (this.watchers.get(deviceId) ?? 0) + 1;
    this.watchers.set(deviceId, count);
    const pendingStop = this.stopTimers.get(deviceId);
    if (pendingStop) {
      clearTimeout(pendingStop);
      this.stopTimers.delete(deviceId);
    } else if (count === 1) this.start(deviceId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(deviceId);
    };
  }

  private start(deviceId: string): void {
    this.agents.send(deviceId, { t: "stats.start", intervalMs: STATS_INTERVAL_MS });
  }

  private release(deviceId: string): void {
    const count = (this.watchers.get(deviceId) ?? 1) - 1;
    if (count > 0) return void this.watchers.set(deviceId, count);
    this.watchers.delete(deviceId);
    const timer = setTimeout(() => {
      this.stopTimers.delete(deviceId);
      this.agents.send(deviceId, { t: "stats.stop" });
    }, this.stopDelayMs);
    timer.unref?.();
    this.stopTimers.set(deviceId, timer);
  }
}
