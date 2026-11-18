import { parseMac } from "@home/protocols";
import { isIPv4 } from "node:net";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AGENT_EXE_URL } from "./download-route.js";
import { readAgentInfo } from "./agent-store.js";
import type { Hello, ServerMessage } from "./protocol.js";

/** A PC keeps at most this many MACs (enrollment caps its list the same way). */
const MAX_MACS = 32;

/**
 * Applies a hello to the PC: its current IP, its version, and any MAC not seen before (MACs are never removed).
 * Returns true when the IP changed.
 */
export async function applyHello(prisma: PrismaClient, deviceId: string, hello: Hello): Promise<boolean> {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return false;
  const config = (device.config ?? {}) as { macs?: string[]; [k: string]: unknown };
  const reported = hello.macs.slice(0, MAX_MACS).map((m) => parseMac(m)).filter((m): m is string => m !== null);
  const macs = [...new Set([...(config.macs ?? []), ...reported])].slice(0, MAX_MACS);
  const ip = hello.ips.find((x) => isIPv4(x)) ?? device.ip;
  await prisma.device.update({ where: { id: deviceId }, data: { ip, agentVersion: hello.version, config: { ...config, macs } } });
  return ip !== device.ip;
}

/** An `update` for an agent older than the published one, else null. */
export function updateOffer(agentDir: string | undefined, version: number): ServerMessage | null {
  const info = readAgentInfo(agentDir);
  return info && info.version > version ? { t: "update", version: info.version, url: AGENT_EXE_URL, sha256: info.sha256 } : null;
}
