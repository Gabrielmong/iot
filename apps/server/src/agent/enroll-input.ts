import { parseMac } from "@home/protocols";
import { isIPv4 } from "node:net";

/** What a freshly installed agent reports when it redeems its enrollment code. */
export interface EnrollInput {
  code: string;
  hostname: string;
  /** Every non-virtual adapter's MAC (normalised), the wake MAC first. */
  macs: string[];
  wakeMac: string;
  ips: string[];
  os: string;
  agentVersion: number;
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 32) : []);

/** Validates a POST /agent/enroll body; null when it is malformed. */
export function parseEnrollInput(body: unknown): EnrollInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const code = str(b.code, 64);
  const hostname = str(b.hostname, 64);
  const wakeMac = typeof b.wakeMac === "string" ? parseMac(b.wakeMac) : null;
  const version = b.agentVersion;
  if (!code || !hostname || !wakeMac || typeof version !== "number" || !Number.isInteger(version) || version < 0) return null;
  const others = list(b.macs).map((m) => (typeof m === "string" ? parseMac(m) : null)).filter((m): m is string => m !== null);
  const macs = [...new Set([wakeMac, ...others])];
  const ips = list(b.ips).filter((ip): ip is string => typeof ip === "string" && isIPv4(ip));
  return { code, hostname, macs, wakeMac, ips, os: str(b.os, 128) ?? "", agentVersion: version };
}
