import type { NetworkInterfaceInfo } from 'node:os';

const toInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) | Number(part), 0) >>> 0;
const toIp = (n: number) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 0xff).join('.');

/**
 * Where to send a magic packet: the global broadcast first, then the directed broadcast of every
 * external IPv4 interface, so the packet leaves on the LAN even when VPN or virtual adapters exist.
 */
export function broadcastAddresses(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const out = new Set<string>(['255.255.255.255']);
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      out.add(toIp((toInt(i.address) | ~toInt(i.netmask)) >>> 0));
    }
  }
  return [...out];
}
