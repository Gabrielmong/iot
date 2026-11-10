import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupGovee, teardownGovee } from '../test/govee-harness.js';
import { GoveeLan } from './client.js';
import { GoveeError, GoveeTimeoutError } from './errors.js';

afterEach(async () => {
  vi.useRealTimers();
  await teardownGovee();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('GoveeLan lifecycle', () => {
  it('re-emits runtime socket errors as socketError without throwing', async () => {
    const { lan } = await setupGovee();
    const errors: Error[] = [];
    lan.on('socketError', (e: Error) => errors.push(e));
    const socket = (lan as unknown as { transport: { socket: { emit(ev: string, e: Error): boolean } } }).transport.socket;
    socket.emit('error', new Error('boom'));
    expect(errors.map((e) => e.message)).toEqual(['boom']);
  });

  it('shares one start between concurrent start() calls', async () => {
    const lan = new GoveeLan({ bindAddress: '127.0.0.1', listenPort: 0, multicastAddress: '127.0.0.1' });
    await Promise.all([lan.start(), lan.start()]);
    const port = lan.listenPort;
    expect(port).toBeGreaterThan(0);
    await lan.start();
    expect(lan.listenPort).toBe(port);
    await lan.stop();
  });

  it('closes the socket when stop() is called during start()', async () => {
    const lan = new GoveeLan({ bindAddress: '127.0.0.1', listenPort: 0, multicastAddress: '127.0.0.1' });
    const starting = lan.start();
    await lan.stop();
    await starting;
    expect(lan.listenPort).toBe(0);
    await expect(lan.setOn('127.0.0.1', true)).rejects.toThrow('not started');
  });

  it('rejects in-flight and queued status calls on stop()', async () => {
    const { lan } = await setupGovee({ silent: true });
    const first = lan.status('127.0.0.1');
    const queued = lan.status('127.0.0.1');
    const results = Promise.allSettled([first, queued]);
    await sleep(20);
    await lan.stop();
    const settled = await results;
    for (const r of settled) {
      expect(r.status).toBe('rejected');
      const reason = (r as PromiseRejectedResult).reason as Error;
      expect(reason).toBeInstanceOf(GoveeError);
      expect(reason).not.toBeInstanceOf(GoveeTimeoutError);
      expect(reason.message).toBe('stopped');
    }
  });

  it('does not let a late reply after a timeout answer the next request', async () => {
    const { lan, device } = await setupGovee({ status: { onOff: 1, brightness: 11 }, statusDelayMs: 150 }, 50);
    await expect(lan.status('127.0.0.1')).rejects.toBeInstanceOf(GoveeTimeoutError);
    await sleep(200); // the late reply (brightness 11) arrives with nothing pending and is dropped
    device.opts.status = { onOff: 1, brightness: 99 };
    device.opts.statusDelayMs = 0;
    expect((await lan.status('127.0.0.1')).brightness).toBe(99);
  });

  it('uses 3000 ms as the default status timeout', async () => {
    const { lan } = await setupGovee({ silent: true });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const outcome = lan.status('127.0.0.1').then(
      () => 'resolved',
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(2999);
    let settled = false;
    void outcome.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toBeInstanceOf(GoveeTimeoutError);
    expect((err as GoveeTimeoutError).timeoutMs).toBe(3000);
  });
});
