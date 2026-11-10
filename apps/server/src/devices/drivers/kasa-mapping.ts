import type { KasaSysInfo } from "@home/protocols";
import type { DeviceRecord, DeviceState, Discovered } from "../types.js";

const CHILD_SEPARATOR = ":";

/** A Kasa externalId is the sysinfo deviceId, or `${deviceId}:${childId}` for a strip outlet. */
export function parseKasaExternalId(externalId: string): { deviceId: string; childId?: string } {
  const i = externalId.indexOf(CHILD_SEPARATOR);
  return i < 0 ? { deviceId: externalId } : { deviceId: externalId.slice(0, i), childId: externalId.slice(i + 1) };
}

export function sysInfoToDiscovered(info: KasaSysInfo, ip: string): Discovered {
  const d: Discovered = { brand: "KASA", externalId: info.deviceId, ip, model: info.model, name: info.alias, kind: "PLUG" };
  if (info.children) {
    d.children = info.children.map((c) => ({ externalId: `${info.deviceId}${CHILD_SEPARATOR}${c.id}`, name: c.alias }));
  }
  return d;
}

/** Live state of each record from one sysinfo reply. A strip is on while any outlet is on. */
export function kasaStates(info: KasaSysInfo, records: DeviceRecord[]): { deviceId: string; state: DeviceState }[] {
  return records.flatMap((r) => {
    const { childId } = parseKasaExternalId(r.externalId);
    const on = childId === undefined ? (info.on ?? info.children?.some((c) => c.on)) : info.children?.find((c) => c.id === childId)?.on;
    return on === undefined ? [] : [{ deviceId: r.id, state: { online: true, on } }];
  });
}

/** Records a relay command switches: one outlet, or (without a child id) the whole device with all its outlets. */
export function recordsSwitchedBy(target: DeviceRecord, records: DeviceRecord[]): DeviceRecord[] {
  return parseKasaExternalId(target.externalId).childId === undefined ? records : records.filter((r) => r.id === target.id);
}
