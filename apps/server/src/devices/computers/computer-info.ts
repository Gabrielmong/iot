import { probeSeen, rdpSeen } from "./computer-config.js";
import type { WakeProgress } from "./wake-tracker.js";

/** A paired HomeAgent: whether it is connected now, and the version it last reported. */
export type AgentInfo = { connected: boolean; version: number | null };

/** What the API shows about a PC beyond its On/Off state. */
export type ComputerInfo = { confirmable: boolean; rdpAddress: string | null; wake: WakeProgress | null; agent: AgentInfo | null };

type Row = { kind: string; ip: string | null; config: unknown; agentTokenHash?: string | null; agentVersion?: number | null };

/**
 * null unless the device is a computer. The RDP address goes to anyone who may see the PC. A PC with an agent
 * is confirmable even if the probe never saw it: the agent's connection tells On from Off.
 */
export function computerInfo(row: Row, wake: WakeProgress | null, agentConnected = false): ComputerInfo | null {
  if (row.kind !== "COMPUTER") return null;
  const agent = row.agentTokenHash ? { connected: agentConnected, version: row.agentVersion ?? null } : null;
  return { confirmable: probeSeen(row) || agent !== null, rdpAddress: rdpSeen(row) && row.ip ? row.ip : null, wake, agent };
}
