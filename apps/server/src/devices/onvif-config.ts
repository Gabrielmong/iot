import type { VideoCodec } from "@home/protocols";
import { isIPv4 } from "node:net";
import type { Prisma } from "../generated/prisma/client.js";
import { asObject } from "../json.js";

/**
 * Where a Tuya camera's local stream is, found over ONVIF and verified with DESCRIBE: kept in
 * `Device.config.onvif`. `host` is the IP the stream was verified at; `port` is the RTSP port. No login here.
 */
export type OnvifCameraConfig = { host: string; port: number; mainPath: string; subPath?: string; codec: VideoCodec };

const CODECS: readonly unknown[] = ["H264", "H265", "OTHER"];

/** The camera's `config.onvif`, or undefined when it is missing or malformed. */
export function onvifCameraConfig(config: Prisma.JsonValue | undefined): OnvifCameraConfig | undefined {
  const o = asObject(asObject(config).onvif as Prisma.JsonValue | undefined);
  const { host, port, mainPath, subPath, codec } = o;
  if (typeof host !== "string" || !isIPv4(host)) return undefined;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  if (!isPath(mainPath) || (subPath !== undefined && !isPath(subPath)) || !CODECS.includes(codec)) return undefined;
  return { host, port, mainPath, ...(subPath ? { subPath } : {}), codec: codec as VideoCodec };
}

function isPath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith("/");
}
