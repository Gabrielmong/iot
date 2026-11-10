import dgram from 'node:dgram';
import os from 'node:os';
import { broadcastAddresses } from './broadcast-addresses.js';
import { magicPacket } from './magic-packet.js';

export const WOL_PORT = 9;

export interface SendMagicPacketOptions {
  /** Defaults to every broadcast address of this machine. */
  addresses?: string[];
  port?: number;
  /** Injected in tests. */
  socket?: () => dgram.Socket;
}

/** Broadcasts a Wake-on-LAN packet for `mac`. Rejects only when every send failed. */
export async function sendMagicPacket(mac: string, opts: SendMagicPacketOptions = {}): Promise<void> {
  const packet = magicPacket(mac);
  const addresses = opts.addresses ?? broadcastAddresses(os.networkInterfaces());
  const socket = (opts.socket ?? (() => dgram.createSocket('udp4')))();
  try {
    await new Promise<void>((resolve) => socket.bind(() => resolve()));
    socket.setBroadcast(true);
    const results = await Promise.allSettled(
      addresses.map((address) => new Promise<void>((resolve, reject) => socket.send(packet, opts.port ?? WOL_PORT, address, (err) => (err ? reject(err) : resolve())))),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length === results.length && failures.length > 0) throw failures[0].reason;
  } finally {
    socket.close();
  }
}
