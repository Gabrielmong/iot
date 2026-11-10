import type { LightState, Rgb } from '../types.js';

export const MIN_KELVIN = 2000;
export const MAX_KELVIN = 9000;

export interface GoveeDeviceInfo {
  ip: string;
  /** The device id (MAC-style). */
  device: string;
  sku: string;
}

export type GoveeMessage = { cmd: 'scan'; info: GoveeDeviceInfo } | { cmd: 'devStatus'; state: LightState };

const envelope = (cmd: string, data: unknown): Buffer => Buffer.from(JSON.stringify({ msg: { cmd, data } }));

const clamp = (n: number, lo: number, hi: number): number => {
  if (!Number.isFinite(n)) throw new RangeError(`Expected a finite number, got ${n}`);
  return Math.min(hi, Math.max(lo, Math.round(n)));
};
const channel = (n: number): number => clamp(n, 0, 255);
const rgb = (c: Rgb): Rgb => ({ r: channel(c.r), g: channel(c.g), b: channel(c.b) });

export const encodeScan = (): Buffer => envelope('scan', { account_topic: 'reserve' });
export const encodeStatusRequest = (): Buffer => envelope('devStatus', {});
export const encodeTurn = (on: boolean): Buffer => envelope('turn', { value: on ? 1 : 0 });
export const encodeBrightness = (pct: number): Buffer => envelope('brightness', { value: clamp(pct, 1, 100) });
/** Setting a colour sends colorTemInKelvin 0. */
export const encodeColor = (color: Rgb): Buffer => envelope('colorwc', { color: rgb(color), colorTemInKelvin: 0 });
/** Setting a temperature sends an all-zero colour, as Govee's docs show. */
export const encodeColorTemp = (kelvin: number): Buffer =>
  envelope('colorwc', { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: clamp(kelvin, MIN_KELVIN, MAX_KELVIN) });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function statusToState(data: Record<string, unknown>): LightState | undefined {
  const { onOff, brightness, color, colorTemInKelvin } = data;
  if (typeof onOff !== 'number' || typeof brightness !== 'number') return undefined;
  const kelvin = typeof colorTemInKelvin === 'number' ? colorTemInKelvin : 0;
  const base = { on: onOff === 1, brightness };
  if (kelvin > 0) return { ...base, mode: 'white', colorTempK: kelvin };
  if (isObject(color) && typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number') {
    return { ...base, mode: 'color', color: { r: color.r, g: color.g, b: color.b } };
  }
  return { ...base, mode: 'color' };
}

/** Parses a datagram; returns undefined for anything that is not a well-formed scan or devStatus reply. */
export function decodeMessage(buf: Buffer): GoveeMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch {
    return undefined;
  }
  const msg = isObject(parsed) ? parsed.msg : undefined;
  if (!isObject(msg) || !isObject(msg.data)) return undefined;
  const { data } = msg;
  if (msg.cmd === 'scan') {
    const { ip, device, sku } = data;
    if (typeof ip !== 'string' || typeof device !== 'string' || typeof sku !== 'string') return undefined;
    return { cmd: 'scan', info: { ip, device, sku } };
  }
  if (msg.cmd === 'devStatus') {
    const state = statusToState(data);
    return state && { cmd: 'devStatus', state };
  }
  return undefined;
}
