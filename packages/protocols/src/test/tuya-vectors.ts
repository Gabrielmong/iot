import { readFileSync } from 'node:fs';
import type { TuyaVersion } from '../types.js';

export interface TuyaVector {
  version: TuyaVersion;
  kind: 'DP_QUERY' | 'CONTROL' | 'SESS_KEY_NEG_START' | 'SESS_KEY_NEG_RESP' | 'SESS_KEY_NEG_FINISH';
  direction: 'client' | 'device';
  localKey: string;
  seq: number;
  cmd: number;
  payloadHex: string;
  frameHex: string;
  ivHex?: string;
  sessionKeyHex?: string;
  localNonceHex?: string;
  remoteNonceHex?: string;
}

export const tuyaVectors: TuyaVector[] = JSON.parse(
  readFileSync(new URL('./fixtures/tuya-vectors.json', import.meta.url), 'utf8'),
);

const HANDSHAKE_KINDS = new Set(['SESS_KEY_NEG_START', 'SESS_KEY_NEG_RESP', 'SESS_KEY_NEG_FINISH']);

/** The key a vector's frame was built with: the session key for 3.4/3.5 data frames, else the local key. */
export function frameKey(v: TuyaVector): Buffer {
  if (v.sessionKeyHex && !HANDSHAKE_KINDS.has(v.kind)) return Buffer.from(v.sessionKeyHex, 'hex');
  return Buffer.from(v.localKey, 'utf8');
}
