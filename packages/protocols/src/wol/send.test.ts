import type dgram from 'node:dgram';
import { describe, expect, it } from 'vitest';
import { sendMagicPacket } from './send.js';

function fakeSocket(fail: (address: string) => boolean = () => false) {
  const sent: { port: number; address: string; length: number }[] = [];
  const state = { broadcast: false, closed: false };
  const socket = {
    bind: (cb: () => void) => cb(),
    setBroadcast: (on: boolean) => { state.broadcast = on; },
    send: (msg: Buffer, port: number, address: string, cb: (err: Error | null) => void) => {
      sent.push({ port, address, length: msg.length });
      cb(fail(address) ? new Error('EHOSTUNREACH') : null);
    },
    close: () => { state.closed = true; },
  };
  return { sent, state, factory: () => socket as unknown as dgram.Socket };
}

describe('sendMagicPacket', () => {
  it('sends one packet per address on port 9 with broadcast on, then closes', async () => {
    const f = fakeSocket();
    await sendMagicPacket('aa:bb:cc:dd:ee:ff', { addresses: ['255.255.255.255', '192.168.0.255'], socket: f.factory });
    expect(f.sent).toEqual([
      { port: 9, address: '255.255.255.255', length: 102 },
      { port: 9, address: '192.168.0.255', length: 102 },
    ]);
    expect(f.state).toEqual({ broadcast: true, closed: true });
  });

  it('resolves when at least one send worked', async () => {
    const f = fakeSocket((a) => a === '10.8.255.255');
    await expect(sendMagicPacket('aa:bb:cc:dd:ee:ff', { addresses: ['10.8.255.255', '192.168.0.255'], socket: f.factory })).resolves.toBeUndefined();
  });

  it('rejects when every send failed', async () => {
    const f = fakeSocket(() => true);
    await expect(sendMagicPacket('aa:bb:cc:dd:ee:ff', { addresses: ['192.168.0.255'], socket: f.factory })).rejects.toThrow('EHOSTUNREACH');
    expect(f.state.closed).toBe(true);
  });

  it('rejects a bad MAC', async () => {
    await expect(sendMagicPacket('nope', { addresses: ['1.2.3.4'], socket: fakeSocket().factory })).rejects.toThrow('Invalid MAC');
  });
});
