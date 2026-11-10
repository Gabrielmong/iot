import type { TuyaVersion } from '../types.js';
import { TuyaCmd } from './constants.js';

const UPDATEDPS = 0x12;
const LAN_EXT_STREAM = 0x40;

/** Commands sent without the "3.x" version header (tinytuya's NO_PROTOCOL_HEADER_CMDS). */
const HEADERLESS_CMDS: ReadonlySet<number> = new Set([
  TuyaCmd.DP_QUERY,
  TuyaCmd.DP_QUERY_NEW,
  UPDATEDPS,
  TuyaCmd.HEART_BEAT,
  TuyaCmd.SESS_KEY_NEG_START,
  TuyaCmd.SESS_KEY_NEG_RESP,
  TuyaCmd.SESS_KEY_NEG_FINISH,
  LAN_EXT_STREAM,
]);

/** The 15-byte version header: the version string followed by 12 zero bytes. */
function versionHeader(version: TuyaVersion): Buffer {
  return Buffer.concat([Buffer.from(version, 'latin1'), Buffer.alloc(12)]);
}

/** Prefixes the version header when `cmd` carries one. */
export function addVersionHeader(version: TuyaVersion, cmd: number, data: Buffer): Buffer {
  return HEADERLESS_CMDS.has(cmd) ? data : Buffer.concat([versionHeader(version), data]);
}

/** Removes a leading version header, if present. */
export function stripVersionHeader(version: TuyaVersion, data: Buffer): Buffer {
  const header = versionHeader(version);
  return data.subarray(0, 3).equals(header.subarray(0, 3)) ? data.subarray(header.length) : data;
}
