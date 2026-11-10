import { describe, expect, it } from 'vitest';
import { clientHarness, ID, INITIAL_DPS, KEY, nextEvent, rawServer, sleep } from '../test/client-harness.js';
import { TuyaClient } from './client.js';
import { TuyaDisconnectedError, TuyaTimeoutError } from './client-errors.js';
import { TuyaFrameError } from './errors.js';

const h = clientHarness();

describe('TuyaClient connection loss', () => {
  it("emits 'error' then 'disconnected' on an undecodable frame", async () => {
    const { device, client } = await h.setup('3.3');
    await client.connect();
    await client.getDps(); // round trip: the device has seen the connection
    const events: string[] = [];
    let error: unknown;
    client.on('error', (e) => {
      events.push('error');
      error = e;
    });
    const disconnected = nextEvent(client, 'disconnected').then(() => events.push('disconnected'));
    device.sendRaw(Buffer.alloc(32, 0xff));
    await disconnected;
    expect(events).toEqual(['error', 'disconnected']);
    expect(error).toBeInstanceOf(TuyaFrameError);
    await expect(client.getDps()).rejects.toThrow(/not connected/);
  });

  it("emits 'disconnected' when the device closes the socket", async () => {
    const { device, client } = await h.setup('3.3');
    await client.connect();
    await client.getDps();
    const disconnected = nextEvent(client, 'disconnected');
    await device.close();
    h.device = undefined;
    await disconnected;
  });

  it("emits 'disconnected' after a missed heartbeat reply", async () => {
    const { client } = await h.setup('3.4', { ignoreHeartbeats: true }, { heartbeatIntervalMs: 50, timeoutMs: 100 });
    await client.connect();
    await nextEvent(client, 'disconnected');
  });

  it('stays connected while heartbeats are answered', async () => {
    const { client } = await h.setup('3.5', {}, { heartbeatIntervalMs: 30, timeoutMs: 100 });
    await client.connect();
    let disconnected = false;
    client.on('disconnected', () => {
      disconnected = true;
    });
    await sleep(250);
    expect(disconnected).toBe(false);
    expect(await client.getDps()).toEqual(INITIAL_DPS);
  });

  it("does not emit 'disconnected' on close()", async () => {
    const { client } = await h.setup('3.3');
    await client.connect();
    let disconnected = false;
    client.on('disconnected', () => {
      disconnected = true;
    });
    client.close();
    await sleep(50);
    expect(disconnected).toBe(false);
  });

  it('rejects connect() with TuyaTimeoutError when the handshake gets no reply', async () => {
    const srv = await rawServer();
    h.client = new TuyaClient({ ip: '127.0.0.1', port: srv.port, id: ID, localKey: KEY, version: '3.4', timeoutMs: 100 });
    await expect(h.client.connect()).rejects.toBeInstanceOf(TuyaTimeoutError);
    h.client.close();
    srv.server.close();
  });
});

describe('TuyaClient close() during connect()', () => {
  it.each(['3.3', '3.4'] as const)('aborts while the TCP connection opens (%s)', async (version) => {
    const { device, client } = await h.setup(version, {}, { heartbeatIntervalMs: 20 });
    const connecting = client.connect();
    client.close();
    await expect(connecting).rejects.toBeInstanceOf(TuyaDisconnectedError);
    await sleep(100); // several heartbeat intervals: nothing may be sent
    await expect(client.getDps()).rejects.toBeInstanceOf(TuyaDisconnectedError);
    expect(device.log).toEqual([]);
  });

  it('aborts during the handshake and leaves no socket open', async () => {
    const srv = await rawServer(); // never answers START
    const client = new TuyaClient({
      ip: '127.0.0.1', port: srv.port, id: ID, localKey: KEY, version: '3.5', timeoutMs: 2000, heartbeatIntervalMs: 20,
    });
    h.client = client;
    const connecting = client.connect();
    while (srv.open.size === 0) await sleep(5);
    client.close();
    await expect(connecting).rejects.toBeInstanceOf(TuyaDisconnectedError);
    await sleep(100);
    expect(srv.open.size).toBe(0);
    srv.server.close();
  });

  it('can connect again after an aborted connect', async () => {
    const { client } = await h.setup('3.4');
    const first = client.connect();
    client.close();
    await expect(first).rejects.toBeInstanceOf(TuyaDisconnectedError);
    await client.connect();
    expect(await client.getDps()).toEqual(INITIAL_DPS);
  });
});
