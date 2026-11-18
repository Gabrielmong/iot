/** The HomeAgent wire protocol, v1: one JSON object per WebSocket message. A closed set; there is no exec. */

export type PowerAction = "sleep" | "shutdown" | "restart";
export type PowerPhase = "countdown" | "cancelled" | "executing" | "skipped";

export interface Hello { t: "hello"; version: number; hostname: string; ips: string[]; macs: string[]; wakeMac: string; os: string }
export interface Stats {
  t: "stats";
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  gpu?: { name: string; load: number; tempC: number };
  disks: { mount: string; free: number; total: number }[];
  netUp: number;
  netDown: number;
  uptimeS: number;
  user?: string;
  idleS?: number;
}
export interface PowerState { t: "power.state"; id: string; phase: PowerPhase; secondsLeft?: number }
export interface UpdateCheck { t: "update.check"; version: number }
export type AgentMessage = Hello | { t: "heartbeat" } | Stats | PowerState | { t: "uninstall.ack" } | UpdateCheck;

export type ServerMessage =
  | { t: "stats.start"; intervalMs: number }
  | { t: "stats.stop" }
  | { t: "power"; id: string; action: PowerAction; requestedBy: string; seconds: number }
  | { t: "power.cancel"; id: string }
  | { t: "uninstall" }
  | { t: "update"; version: number; url: string; sha256: string }
  | { t: "update.none"; version: number };

export const encode = (msg: ServerMessage): string => JSON.stringify({ v: 1, ...msg });

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= 64 && v.every((s) => isStr(s) && s.length <= 64) ? v : null);
const isVersion = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const PHASES = new Set<string>(["countdown", "cancelled", "executing", "skipped"]);

function hello(m: Record<string, unknown>): Hello | null {
  const ips = strs(m.ips);
  const macs = strs(m.macs);
  if (!isNum(m.version) || !Number.isInteger(m.version) || m.version < 0 || !isStr(m.hostname) || !ips || !macs || !isStr(m.wakeMac) || !isStr(m.os)) return null;
  return { t: "hello", version: m.version, hostname: m.hostname, ips, macs, wakeMac: m.wakeMac, os: m.os };
}

function stats(m: Record<string, unknown>): Stats | null {
  const disks = Array.isArray(m.disks) ? m.disks : null;
  if (![m.cpu, m.ramUsed, m.ramTotal, m.netUp, m.netDown, m.uptimeS].every(isNum) || !disks) return null;
  const okDisks = disks.every((d) => d && isStr(d.mount) && isNum(d.free) && isNum(d.total));
  const g = m.gpu as Record<string, unknown> | undefined;
  const okGpu = g === undefined || (g !== null && isStr(g.name) && isNum(g.load) && isNum(g.tempC));
  if (!okDisks || !okGpu || (m.user !== undefined && !isStr(m.user)) || (m.idleS !== undefined && !isNum(m.idleS))) return null;
  const { v: _v, ...rest } = m;
  return rest as unknown as Stats;
}

function powerState(m: Record<string, unknown>): PowerState | null {
  if (!isStr(m.id) || !isStr(m.phase) || !PHASES.has(m.phase)) return null;
  if (m.secondsLeft !== undefined && !isNum(m.secondsLeft)) return null;
  return { t: "power.state", id: m.id, phase: m.phase as PowerPhase, ...(m.secondsLeft !== undefined ? { secondsLeft: m.secondsLeft as number } : {}) };
}

/** A well-formed v1 agent message, or null (unknown type, wrong version, bad fields, not JSON). */
export function parseAgentMessage(raw: string): AgentMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null || (m as { v?: unknown }).v !== 1) return null;
  const msg = m as Record<string, unknown>;
  switch (msg.t) {
    case "hello":
      return hello(msg);
    case "heartbeat":
      return { t: "heartbeat" };
    case "stats":
      return stats(msg);
    case "power.state":
      return powerState(msg);
    case "uninstall.ack":
      return { t: "uninstall.ack" };
    case "update.check":
      return isVersion(msg.version) ? { t: "update.check", version: msg.version } : null;
    default:
      return null;
  }
}
