import type { TuyaVersion } from '../types.js';
import { TuyaCmd } from './constants.js';

/** JSON payloads in the exact shapes tinytuya sends (key order matters for byte-level parity). */

const usesNewCommands = (version: TuyaVersion) => version === '3.4' || version === '3.5';

/** Command codes for querying and setting dps: 3.4/3.5 use the *_NEW codes. */
export function commandsFor(version: TuyaVersion): { query: number; control: number } {
  return usesNewCommands(version)
    ? { query: TuyaCmd.DP_QUERY_NEW, control: TuyaCmd.CONTROL_NEW }
    : { query: TuyaCmd.DP_QUERY, control: TuyaCmd.CONTROL };
}

/** DP query payload. `t` is Unix seconds. */
export function queryPayload(version: TuyaVersion, id: string, t: number): Buffer {
  if (usesNewCommands(version)) return json({});
  return json({ gwId: id, devId: id, uid: id, t: String(t) });
}

/** Control payload setting `dps`. `t` is Unix seconds. */
export function controlPayload(version: TuyaVersion, id: string, dps: Record<string, unknown>, t: number): Buffer {
  if (usesNewCommands(version)) return json({ protocol: 5, t, data: { dps } });
  return json({ devId: id, uid: id, t: String(t), dps });
}

export function heartbeatPayload(id: string): Buffer {
  return json({ gwId: id, devId: id });
}

/**
 * The dps in a device reply or STATUS push: top-level `dps` (3.1/3.3) or `data.dps` (3.4/3.5).
 * Returns undefined for JSON without dps; throws if the payload is not JSON.
 */
export function extractDps(payload: Buffer): Record<string, unknown> | undefined {
  const body: unknown = JSON.parse(payload.toString('utf8'));
  if (!isObject(body)) return undefined;
  if (isObject(body.dps)) return body.dps;
  if (isObject(body.data) && isObject(body.data.dps)) return body.data.dps;
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}
