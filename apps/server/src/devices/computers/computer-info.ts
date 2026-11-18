import { probeSeen, rdpSeen } from "./computer-config.js";
import type { WakeProgress } from "./wake-tracker.js";

/** What the API shows about a PC beyond its On/Off state. */
export type ComputerInfo = { confirmable: boolean; rdpAddress: string | null; wake: WakeProgress | null };

type Row = { kind: string; ip: string | null; config: unknown };

/** null unless the device is a computer. The RDP address goes to anyone who may see the PC. */
export function computerInfo(row: Row, wake: WakeProgress | null): ComputerInfo | null {
  if (row.kind !== "COMPUTER") return null;
  return { confirmable: probeSeen(row), rdpAddress: rdpSeen(row) && row.ip ? row.ip : null, wake };
}
