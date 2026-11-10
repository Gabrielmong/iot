import { KasaError } from './errors.js';

/** The parts of an IOT `get_sysinfo` reply this app uses. Strips (KP303) have `children`; plugs have `on`. */
export type KasaSysInfo = {
  deviceId: string;
  model: string;
  alias: string;
  children?: { id: string; alias: string; on: boolean }[];
  on?: boolean;
};

interface RawChild {
  id?: unknown;
  alias?: unknown;
  state?: unknown;
}

/** Maps a raw sysinfo object. Throws KasaError when an identity field (`deviceId`, child `id`) is missing. */
export function parseSysInfo(raw: Record<string, unknown>): KasaSysInfo {
  const info: KasaSysInfo = { deviceId: requireId(raw.deviceId, 'deviceId'), model: String(raw.model ?? ''), alias: String(raw.alias ?? '') };
  if (Array.isArray(raw.children)) {
    info.children = (raw.children as RawChild[]).map((c) => ({ id: requireId(c.id, 'child id'), alias: String(c.alias ?? ''), on: c.state === 1 }));
  }
  if (typeof raw.relay_state === 'number') info.on = raw.relay_state === 1;
  return info;
}

function requireId(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new KasaError(`Device sysinfo has no ${what}`);
  return value;
}
