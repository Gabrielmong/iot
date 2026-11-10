import { createSocket } from 'node:dgram';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { TuyaBroadcast } from './broadcast.js';
import { TuyaCmd } from './constants.js';
import { udpKey } from './crypto.js';
import { startTuyaDiscovery, type DiscoveryPorts } from './discovery.js';
import { encodeFrame } from './frame.js';

/** Asks the OS for a free UDP port, so tests never bind the real 6666/6667/7000. */
async function freeUdpPort(): Promise<number> {
  const s = createSocket('udp4');
  await new Promise<void>((resolve) => s.bind(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

async function send(port: number, msg: Buffer): Promise<void> {
  const s = createSocket('udp4');
  await new Promise<void>((resolve, reject) => s.send(msg, port, '127.0.0.1', (err) => (err ? reject(err) : resolve())));
  s.close();
}

function broadcast(version: '3.1' | '3.3' | '3.5', gwId: string): Buffer {
  const payload = Buffer.from(JSON.stringify({ ip: '10.0.0.9', gwId, productKey: 'pk', version }));
  return encodeFrame({ version, key: udpKey, seq: 0, cmd: TuyaCmd.UDP_NEW, payload, retcode: 0 });
}

describe('startTuyaDiscovery', () => {
  let stop: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await stop?.();
    stop = undefined;
  });

  async function listen(): Promise<{ ports: DiscoveryPorts; next: () => Promise<TuyaBroadcast> }> {
    const ports = { plain: await freeUdpPort(), ecb: await freeUdpPort(), gcm: await freeUdpPort() };
    const seen: TuyaBroadcast[] = [];
    const waiters: ((d: TuyaBroadcast) => void)[] = [];
    const discovery = await startTuyaDiscovery(
      (d) => {
        const w = waiters.shift();
        if (w) w(d);
        else seen.push(d);
      },
      { bindAddress: '127.0.0.1', ports },
    );
    stop = discovery.stop;
    const next = () => {
      const d = seen.shift();
      return d ? Promise.resolve(d) : new Promise<TuyaBroadcast>((resolve) => waiters.push(resolve));
    };
    return { ports, next };
  }

  it('reports a 3.3 device broadcasting on the ECB port, using the sender address', async () => {
    const { ports, next } = await listen();
    await send(ports.ecb, broadcast('3.3', 'gw33'));
    expect(await next()).toEqual({ ip: '127.0.0.1', gwId: 'gw33', productKey: 'pk', version: '3.3' });
  });

  it('reports a 3.5 device broadcasting on the GCM port', async () => {
    const { ports, next } = await listen();
    await send(ports.gcm, broadcast('3.5', 'gw35'));
    expect(await next()).toEqual({ ip: '127.0.0.1', gwId: 'gw35', productKey: 'pk', version: '3.5' });
  });

  it('reports a plain broadcast and skips undecodable packets', async () => {
    const { ports, next } = await listen();
    await send(ports.plain, Buffer.from('junk'));
    await send(ports.plain, broadcast('3.1', 'gw31'));
    expect(await next()).toMatchObject({ gwId: 'gw31', version: '3.1' });
  });

  it('reports nothing once stopped', async () => {
    const { ports, next } = await listen();
    await stop!();
    stop = undefined;
    await send(ports.ecb, broadcast('3.3', 'late'));
    const outcome = await Promise.race([next().then(() => 'reported'), delay(150).then(() => 'silent')]);
    expect(outcome).toBe('silent');
  });
});
