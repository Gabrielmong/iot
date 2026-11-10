import { createSocket, type Socket } from 'node:dgram';
import { decodeBroadcast, type TuyaBroadcast } from './broadcast.js';

export type { TuyaBroadcast } from './broadcast.js';

/** UDP ports Tuya devices broadcast on: plain JSON, AES-ECB (udpKey) and AES-GCM (udpKey). */
export type DiscoveryPorts = { plain: number; ecb: number; gcm: number };

export const TUYA_DISCOVERY_PORTS: DiscoveryPorts = { plain: 6666, ecb: 6667, gcm: 7000 };

export interface DiscoveryOptions {
  bindAddress?: string;
  /** Overrides the listen ports (tests use ephemeral ones). */
  ports?: DiscoveryPorts;
}

/**
 * Listens for Tuya discovery broadcasts and reports each decodable one (with the sender's address
 * as `ip`). Undecodable packets are ignored. Every broadcast is reported, including repeats.
 */
export async function startTuyaDiscovery(
  onDevice: (d: TuyaBroadcast) => void,
  opts: DiscoveryOptions = {},
): Promise<{ stop(): Promise<void> }> {
  const ports = opts.ports ?? TUYA_DISCOVERY_PORTS;
  const sockets: Socket[] = [];
  const stop = () => Promise.all(sockets.map(closeSocket)).then(() => undefined);
  try {
    for (const port of [ports.plain, ports.ecb, ports.gcm]) {
      const socket = createSocket({ type: 'udp4', reuseAddr: true });
      sockets.push(socket);
      socket.on('message', (msg, rinfo) => {
        const device = decodeBroadcast(msg);
        if (device) onDevice({ ip: rinfo.address, ...device });
      });
      await bind(socket, port, opts.bindAddress);
    }
  } catch (err) {
    await stop();
    throw err;
  }
  return { stop };
}

function bind(socket: Socket, port: number, address: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, address, () => {
      socket.off('error', reject);
      // Late socket errors must not crash the process; discovery is best-effort.
      socket.on('error', () => {});
      resolve();
    });
  });
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve(); // already closed, or never bound
    }
  });
}
