import type { SwannChannel, SwannProbeResult, VideoCodec } from "@home/protocols";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Discovered } from "../types.js";

const CODECS: readonly VideoCodec[] = ["H264", "H265", "OTHER"];

/** The stored `swann.probe` JSON, or undefined when it is missing or malformed. */
export function parseSwannProbe(json: string): SwannProbeResult | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || typeof value.template !== "string" || !Array.isArray(value.channels)) return undefined;
  const channels = value.channels.map(toChannel);
  if (channels.some((c) => c === undefined)) return undefined;
  return { template: value.template, channels: channels as SwannChannel[] };
}

/** A camera device's stream config (written by discovery), or undefined when it is incomplete. */
export function swannCameraConfig(config: Prisma.JsonValue | undefined): SwannChannel | undefined {
  return toChannel(config);
}

/** One CAMERA per recorder channel, keyed `<host>:ch<N>`. */
export function probeToDiscovered(host: string, probe: SwannProbeResult): Discovered[] {
  return probe.channels.map((c) => ({
    brand: "SWANN",
    kind: "CAMERA",
    externalId: `${host}:ch${c.channel}`,
    ip: host,
    name: `Camera ${c.channel}`,
    streamSource: "LOCAL",
    config: { channel: c.channel, mainPath: c.mainPath, ...(c.subPath ? { subPath: c.subPath } : {}), codec: c.codec },
  }));
}

/** The path checked for liveness: the lighter sub stream when there is one. */
export function statusPath(channel: SwannChannel): string {
  return channel.subPath ?? channel.mainPath;
}

function toChannel(value: unknown): SwannChannel | undefined {
  if (!isRecord(value)) return undefined;
  const { channel, mainPath, subPath, codec } = value;
  if (typeof channel !== "number" || !Number.isInteger(channel) || channel < 1) return undefined;
  if (!isPath(mainPath) || (subPath !== undefined && !isPath(subPath))) return undefined;
  if (!CODECS.includes(codec as VideoCodec)) return undefined;
  return { channel, mainPath, ...(subPath ? { subPath } : {}), codec: codec as VideoCodec };
}

const isPath = (v: unknown): v is string => typeof v === "string" && v.startsWith("/");

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
