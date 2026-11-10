import { describe, expect, it } from 'vitest';
import { clientHarness, ID, KEY, nextEvent, rawServer, WRONG_KEY } from '../test/client-harness.js';
import { TuyaClient } from './client.js';
import { TuyaKeyError } from './client-errors.js';
import { TuyaFrameError } from './errors.js';

const h = clientHarness();

describe('TuyaClient key errors', () => {
  it.each(['3.4', '3.5'] as const)('rejects connect() with TuyaKeyError on %s', async (version) => {
    const { client } = await h.setup(version, {}, { localKey: WRONG_KEY });
    await expect(client.connect()).rejects.toBeInstanceOf(TuyaKeyError);
  });

  it('rejects connect() with TuyaKeyError when the RESP proves a different local nonce', async () => {
    const { client } = await h.setup('3.4', { respPayload: () => Buffer.alloc(48, 7) });
    await expect(client.connect()).rejects.toBeInstanceOf(TuyaKeyError);
  });

  it('rejects a too-short RESP with TuyaFrameError', async () => {
    const { client } = await h.setup('3.5', { respPayload: () => Buffer.alloc(20, 1) });
    const err = await client.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TuyaFrameError);
  });

  it('keeps a non-integrity handshake failure (unknown prefix) as TuyaFrameError', async () => {
    const srv = await rawServer((s) => s.once('data', () => s.write(Buffer.alloc(32, 0xff))));
    h.client = new TuyaClient({ ip: '127.0.0.1', port: srv.port, id: ID, localKey: KEY, version: '3.4', timeoutMs: 500 });
    const err = await h.client.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TuyaFrameError);
    srv.server.close();
  });

  it('rejects getDps() with TuyaKeyError on 3.3 and drops the connection', async () => {
    const { client } = await h.setup('3.3', {}, { localKey: WRONG_KEY });
    await client.connect();
    const disconnected = nextEvent(client, 'disconnected');
    await expect(client.getDps()).rejects.toBeInstanceOf(TuyaKeyError);
    await disconnected;
  });

  it.each(['3.1', '3.3'] as const)('rejects a non-JSON dps reply with TuyaKeyError on %s and drops the connection', async (version) => {
    const { client } = await h.setup(version, { queryReplyPayload: Buffer.from('json obj data unvalid') });
    await client.connect();
    const errors: unknown[] = [];
    client.on('error', (e) => errors.push(e));
    const disconnected = nextEvent(client, 'disconnected');
    await expect(client.getDps()).rejects.toBeInstanceOf(TuyaKeyError);
    await disconnected;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TuyaKeyError);
  });

  it('rejects a local key that is not 16 bytes', () => {
    expect(() => new TuyaClient({ ip: '127.0.0.1', id: ID, localKey: 'short', version: '3.3' })).toThrow(RangeError);
  });
});
