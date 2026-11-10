import type { TuyaVersion } from '../types.js';
import { udpKey } from './crypto.js';
import { PREFIX_6699 } from './wire.js';
import { decodeFrames } from './frame.js';

export type TuyaBroadcast = { ip: string; gwId: string; productKey: string; version: TuyaVersion };

const VERSIONS: ReadonlySet<string> = new Set<TuyaVersion>(['3.1', '3.3', '3.4', '3.5']);

/**
 * Decodes a UDP discovery broadcast (minus the sender ip), or returns undefined if it is not one.
 * Like tinytuya's `decrypt_udp`, the payload of a 55AA packet may be plain JSON (port 6666) or
 * AES-ECB with udpKey (6667), and a 6699 packet (7000) is AES-GCM with udpKey. Devices disagree on
 * whether a retcode precedes the payload, so both layouts are tried. As in tinytuya, the 55AA CRC is
 * not enforced: a packet is accepted if its payload decrypts and parses to JSON with a gwId.
 */
export function decodeBroadcast(msg: Buffer): Omit<TuyaBroadcast, 'ip'> | undefined {
  const is6699 = msg.length >= 4 && msg.readUInt32BE(0) === PREFIX_6699;
  // A 55AA payload decoded as "3.1" is taken as-is; as "3.3" it is ECB-decrypted.
  const versions: TuyaVersion[] = is6699 ? ['3.5'] : ['3.1', '3.3'];
  for (const hasRetcode of [true, false]) {
    for (const version of versions) {
      const parsed = parseBroadcastJson(tryDecode(msg, version, hasRetcode));
      if (parsed) return parsed;
    }
  }
  return undefined;
}

function tryDecode(msg: Buffer, version: TuyaVersion, hasRetcode: boolean): Buffer | undefined {
  try {
    const { frames } = decodeFrames(msg, version, udpKey, { hasRetcode, verifyCrc: false });
    return frames[0]?.payload;
  } catch {
    return undefined;
  }
}

function parseBroadcastJson(payload: Buffer | undefined): Omit<TuyaBroadcast, 'ip'> | undefined {
  if (!payload) return undefined;
  let body: unknown;
  try {
    // Some senders pad the JSON with trailing NUL bytes.
    body = JSON.parse(payload.toString('utf8').replace(/\0+$/, ''));
  } catch {
    return undefined;
  }
  if (typeof body !== 'object' || body === null) return undefined;
  const { gwId, productKey, version } = body as Record<string, unknown>;
  if (typeof gwId !== 'string' || gwId === '' || typeof version !== 'string' || !VERSIONS.has(version)) return undefined;
  return { gwId, productKey: typeof productKey === 'string' ? productKey : '', version: version as TuyaVersion };
}
