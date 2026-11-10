import { parseMac } from './mac.js';

/** The Wake-on-LAN payload: 6 bytes of 0xFF, then the 6-byte MAC 16 times (102 bytes). */
export function magicPacket(mac: string): Buffer {
  const normal = parseMac(mac);
  if (!normal) throw new Error(`Invalid MAC address: ${mac}`);
  const bytes = Buffer.from(normal.replace(/:/g, ''), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => bytes)]);
}
