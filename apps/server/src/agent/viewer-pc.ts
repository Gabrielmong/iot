import { isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";
import type { PrismaClient } from "../generated/prisma/client.js";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** This server's own IPv4 addresses (loopback included). */
export function serverIps(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a?.family === "IPv4")
    .map((a) => a!.address);
}

/**
 * The IPv4 addresses a request came from: the peer's own, or, for a browser on the server itself (loopback),
 * every address of this server, so the server PC is recognised by the IP it is adopted under.
 */
export function viewerIps(remote: string | undefined, localIps: () => string[] = serverIps): string[] {
  if (!remote) return [];
  if (LOOPBACK.has(remote)) return localIps();
  const ip = remote.startsWith("::ffff:") ? remote.slice(7) : remote;
  return isIPv4(ip) ? [ip] : [];
}

/** True when one of `ips` is an adopted PC running the HomeAgent, which opens `home-rdp://` links there. */
export async function viewerHasAgent(prisma: PrismaClient, ips: string[]): Promise<boolean> {
  if (ips.length === 0) return false;
  const n = await prisma.device.count({ where: { kind: "COMPUTER", adopted: true, agentTokenHash: { not: null }, ip: { in: ips } } });
  return n > 0;
}
