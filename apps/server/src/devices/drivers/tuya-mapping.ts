import { dpsToLightState, lightPatchToDps, V1_LIGHT_SCHEMA, V2_LIGHT_SCHEMA, type DpSchema, type TuyaBroadcast } from "@home/protocols";
import type { DeviceKind, DeviceState, Discovered, StatePatch } from "../types.js";

/** Switches and plugs: the first (or only) relay. */
const RELAY_DP = "1";

export function broadcastToDiscovered(b: TuyaBroadcast): Discovered {
  return { brand: "TUYA", externalId: b.gwId, ip: b.ip, config: { version: b.version, productKey: b.productKey } };
}

/** The cloud schema when known; otherwise v2 lights report DP 20, v1 lights DP 1. */
export function lightSchema(dps: Record<string, unknown>, known?: DpSchema): DpSchema {
  return known ?? (V2_LIGHT_SCHEMA.switch in dps ? V2_LIGHT_SCHEMA : V1_LIGHT_SCHEMA);
}

export function dpsToDeviceState(kind: DeviceKind, dps: Record<string, unknown>, online: boolean, schema?: DpSchema): DeviceState {
  if (kind === "LIGHT") return { online, light: dpsToLightState(dps, lightSchema(dps, schema)) };
  if (kind === "SWITCH" || kind === "PLUG") return typeof dps[RELAY_DP] === "boolean" ? { online, on: dps[RELAY_DP] } : { online };
  return { online };
}

export function patchToDps(kind: DeviceKind, patch: StatePatch, dps: Record<string, unknown>, schema?: DpSchema): Record<string, unknown> {
  if (kind === "LIGHT") {
    const s = lightSchema(dps, schema);
    return lightPatchToDps(patch, s, dpsToLightState(dps, s));
  }
  return patch.on === undefined ? {} : { [RELAY_DP]: patch.on };
}
