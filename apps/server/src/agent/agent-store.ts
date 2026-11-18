import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AgentInfo {
  version: number;
  sha256: string;
  exePath: string;
}

/**
 * The HomeAgent published in `dir` (`HomeAgent.exe` plus `agent.json` = `{ "version": n, "sha256": "<hex>" }`),
 * or null unless both exist and are well formed. Read per request: the deploy helper replaces them under a running server.
 */
export function readAgentInfo(dir: string | undefined): AgentInfo | null {
  if (!dir) return null;
  const exePath = join(dir, "HomeAgent.exe");
  const jsonPath = join(dir, "agent.json");
  if (!existsSync(exePath) || !existsSync(jsonPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(jsonPath, "utf8")) as { version?: unknown; sha256?: unknown } | null;
    const { version, sha256 } = meta ?? {};
    if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) return null;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    return { version, sha256, exePath };
  } catch {
    return null;
  }
}
