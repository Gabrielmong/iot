import type { DpSchema, TuyaVersion } from "@home/protocols";
import type { DeviceKind, DeviceRecord } from "../types.js";

/** Everything needed to connect to one Tuya device. */
export type TuyaTarget = {
  deviceId: string;
  externalId: string;
  ip: string;
  localKey: string;
  version: TuyaVersion;
  kind: DeviceKind;
  dpSchema?: DpSchema;
};

/** `config` written by discovery (`version`, `productKey`) and the cloud key sync (`dpSchema`, `category`). */
type TuyaConfig = { version?: unknown; dpSchema?: DpSchema };

const VERSIONS = new Set<string>(["3.1", "3.3", "3.4", "3.5"]);
const DEFAULT_VERSION: TuyaVersion = "3.3";
const CONTROLLED = new Set<DeviceKind>(["LIGHT", "SWITCH", "PLUG", "UNKNOWN"]);

export type TuyaPlan = { connect: TuyaTarget } | { skip: "needs-key" | "not-controlled" | "no-ip" };

/** The device's Tuya protocol version from its config (default 3.3). */
export function tuyaVersionOf(config: unknown): TuyaVersion {
  const version = ((config ?? {}) as TuyaConfig).version;
  return typeof version === "string" && VERSIONS.has(version) ? (version as TuyaVersion) : DEFAULT_VERSION;
}

/** Decides whether and how to connect to an adopted Tuya device. */
export function planTuya(d: DeviceRecord): TuyaPlan {
  if (!CONTROLLED.has(d.kind)) return { skip: "not-controlled" };
  if (!d.secretPlain) return { skip: "needs-key" };
  if (!d.ip) return { skip: "no-ip" };
  const config = (d.config ?? {}) as TuyaConfig;
  const version = tuyaVersionOf(config);
  return {
    connect: { deviceId: d.id, externalId: d.externalId, ip: d.ip, localKey: d.secretPlain, version, kind: d.kind, dpSchema: config.dpSchema },
  };
}
