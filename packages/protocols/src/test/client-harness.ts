import { createServer, type Server, type Socket } from 'node:net';
import { afterEach } from 'vitest';
import { TuyaClient, type TuyaClientOptions } from '../tuya/client.js';
import type { TuyaVersion } from '../types.js';
import { FakeTuyaDevice, type FakeDeviceOptions } from './fake-tuya-device.js';

export const ID = 'device0123456789abcd';
export const KEY = '0123456789abcdef';
export const WRONG_KEY = 'fedcba9876543210';
export const INITIAL_DPS = { '20': true, '22': 500 };

/** Resolves with the args of the next `event` (unlike events.once, does not reject on 'error'). */
export function nextEvent(emitter: TuyaClient, event: 'dps' | 'disconnected'): Promise<unknown[]> {
  return new Promise((resolve) => emitter.once(event, (...args: unknown[]) => resolve(args)));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-test fake device + client, torn down after each test. */
export function clientHarness() {
  const h = {
    device: undefined as FakeTuyaDevice | undefined,
    client: undefined as TuyaClient | undefined,
    async setup(version: TuyaVersion, fake: Partial<FakeDeviceOptions> = {}, opts: Partial<TuyaClientOptions> = {}) {
      const device = await FakeTuyaDevice.start({ version, id: ID, localKey: KEY, dps: { ...INITIAL_DPS }, ...fake });
      const client = new TuyaClient({ ip: '127.0.0.1', port: device.port, id: ID, localKey: KEY, version, timeoutMs: 500, ...opts });
      client.on('error', () => {});
      h.device = device;
      h.client = client;
      return { device, client };
    },
  };
  afterEach(async () => {
    h.client?.close();
    h.client = undefined;
    await h.device?.close();
    h.device = undefined;
  });
  return h;
}

/** A bare TCP server that hands each connection to `onSocket` and tracks open sockets. */
export async function rawServer(
  onSocket: (s: Socket) => void = () => {},
): Promise<{ port: number; open: Set<Socket>; server: Server }> {
  const open = new Set<Socket>();
  const server = createServer((s) => {
    open.add(s);
    s.on('error', () => {});
    s.on('close', () => open.delete(s));
    s.resume(); // keep reading, so the peer's FIN is seen and 'close' fires
    onSocket(s);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { port: (server.address() as { port: number }).port, open, server };
}
