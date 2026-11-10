import { randomBytes } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import { setTimeout as delay } from 'node:timers/promises';
import { discoveryPublicKeyPem } from './discovery-key.js';
import { buildDiscoveryQuery } from './discovery-query.js';
import { parseDiscoveryResponse } from './discovery-response.js';

export const KASA_DISCOVERY_PORT = 20002;
/** python-kasa sends this many probes, spread evenly over the discovery timeout. */
const PROBE_COUNT = 3;

export interface KasaDiscoveryOptions {
  /** Local address to bind (picks the interface). */
  bindAddress?: string;
  /** Where probes go. Defaults to the limited broadcast address. */
  target?: string;
  /** Overrides the device port (tests use an ephemeral one). */
  port?: number;
}

export interface KasaDiscoveredDevice {
  ip: string;
  deviceId: string;
  model: string;
}

/**
 * Broadcasts python-kasa's v2 discovery probe to UDP 20002 and collects replies for `timeoutMs`
 * (measured from the first probe). Each IP is reported once; replies that do not parse are ignored.
 */
export async function discoverKasa(timeoutMs: number, opts: KasaDiscoveryOptions = {}): Promise<KasaDiscoveredDevice[]> {
  const target = opts.target ?? '255.255.255.255';
  const port = opts.port ?? KASA_DISCOVERY_PORT;
  const query = buildDiscoveryQuery(await discoveryPublicKeyPem(), randomBytes(4));
  const found = new Map<string, KasaDiscoveredDevice>();

  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (msg, rinfo) => {
    if (rinfo.port !== port || found.has(rinfo.address)) return;
    const info = parseDiscoveryResponse(msg);
    if (info) found.set(rinfo.address, { ip: rinfo.address, ...info });
  });
  try {
    await bind(socket, opts.bindAddress);
    socket.setBroadcast(true);
    for (let i = 0; i < PROBE_COUNT; i++) {
      socket.send(query, port, target);
      await delay(timeoutMs / PROBE_COUNT);
    }
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
  return [...found.values()];
}

function bind(socket: Socket, address: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, address, () => {
      socket.off('error', reject);
      // Send failures (e.g. no route for broadcast) must not crash the process; discovery is best-effort.
      socket.on('error', () => {});
      resolve();
    });
  });
}
