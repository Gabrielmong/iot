import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseMac } from '../wol/mac.js';

const NOT_A_HOST = new Set(['00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff']);
const LOOKUP_TIMEOUT_MS = 2000;

/**
 * The MAC for `ip` in a neighbour (ARP) table dump: Windows `arp -a`, Linux /proc/net/arp or macOS
 * `arp -n`. Null when the table has no complete entry for it.
 */
export function macFromNeighborTable(table: string, ip: string): string | null {
  for (const line of table.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/).map((t) => t.replace(/^\(|\)$/g, ''));
    if (!tokens.includes(ip)) continue;
    for (const token of tokens) {
      const mac = /[:\-]/.test(token) ? parseMac(token) : null;
      if (mac && !NOT_A_HOST.has(mac)) return mac;
    }
  }
  return null;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

function neighborTable(ip: string): Promise<string> {
  if (process.platform === 'win32') return run('arp', ['-a', ip]);
  if (process.platform === 'linux') return readFile('/proc/net/arp', 'utf8');
  return run('arp', ['-n', ip]);
}

/**
 * The MAC of a LAN host this machine talked to recently (it must be in the ARP table, so reach it
 * first, e.g. with a TCP probe). Undefined when unknown; never rejects.
 */
export async function lookupMac(ip: string): Promise<string | undefined> {
  try {
    return macFromNeighborTable(await neighborTable(ip), ip) ?? undefined;
  } catch {
    return undefined;
  }
}
