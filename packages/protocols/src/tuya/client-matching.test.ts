import { describe, expect, it } from 'vitest';
import { clientHarness, INITIAL_DPS, nextEvent } from '../test/client-harness.js';
import { TuyaDisconnectedError, TuyaTimeoutError } from './client-errors.js';

const h = clientHarness();

function partialStatus(version: string): Buffer {
  const dps = { '22': 9 };
  const body = version === '3.4' || version === '3.5' ? { protocol: 4, t: 1, data: { dps } } : { dps };
  return Buffer.from(JSON.stringify(body));
}

describe.each(['3.1', '3.3', '3.4', '3.5'] as const)('TuyaClient reply matching %s', (version) => {
  it('serializes requests: the control is sent only after the delayed query reply', async () => {
    const { device, client } = await h.setup(version, { firstQueryReplyDelayMs: 100 });
    await client.connect();
    const [dps] = await Promise.all([client.getDps(), client.setDps({ '22': 10 })]);
    expect(dps).toEqual(INITIAL_DPS);
    expect(device.log).toEqual(['recv query', 'reply query', 'recv control']);
    expect(device.controls).toEqual([{ '22': 10 }]);
  });

  it("returns the full query reply, not a partial STATUS pushed just before it, and emits the push as 'dps'", async () => {
    const { client } = await h.setup(version, { statusBeforeQueryReply: partialStatus(version) });
    await client.connect();
    const pushed = nextEvent(client, 'dps');
    expect(await client.getDps()).toEqual(INITIAL_DPS);
    expect(await pushed).toEqual([{ '22': 9 }]);
  });

  it('ignores a non-JSON STATUS pushed during getDps', async () => {
    const { client } = await h.setup(version, { statusBeforeQueryReply: Buffer.from('not json') });
    await client.connect();
    expect(await client.getDps()).toEqual(INITIAL_DPS);
  });

  it('is not acked by the STATUS push that precedes the control ack', async () => {
    const { client } = await h.setup(version, { withholdControlAck: true }, { timeoutMs: 150 });
    await client.connect();
    const pushed = nextEvent(client, 'dps');
    await expect(client.setDps({ '20': false })).rejects.toBeInstanceOf(TuyaTimeoutError);
    expect(await pushed).toEqual([{ '20': false }]);
  });
});

describe.each(['3.1', '3.3', '3.4'] as const)('TuyaClient late replies %s', (version) => {
  it('does not let a late ack resolve the next setDps (replies are matched by seq)', async () => {
    const { client } = await h.setup(version, { controlAckDelayMs: 250 }, { timeoutMs: 150 });
    await client.connect();
    await expect(client.setDps({ '20': false })).rejects.toBeInstanceOf(TuyaTimeoutError);
    // The first ack lands at ~250 ms, inside this request's window, but its seq does not match.
    await expect(client.setDps({ '20': true })).rejects.toBeInstanceOf(TuyaTimeoutError);
  });
});

describe('TuyaClient late replies 3.5', () => {
  it('drops the connection on a timeout, since 3.5 replies cannot be matched by seq', async () => {
    const { client } = await h.setup('3.5', { controlAckDelayMs: 250 }, { timeoutMs: 150 });
    await client.connect();
    const disconnected = nextEvent(client, 'disconnected');
    await expect(client.setDps({ '20': false })).rejects.toBeInstanceOf(TuyaTimeoutError);
    await disconnected;
    await expect(client.setDps({ '20': true })).rejects.toBeInstanceOf(TuyaDisconnectedError);
  });
});
