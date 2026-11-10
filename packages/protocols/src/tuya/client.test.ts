import { describe, expect, it } from 'vitest';
import { clientHarness, INITIAL_DPS, nextEvent } from '../test/client-harness.js';
import { TuyaTimeoutError } from './client-errors.js';

const h = clientHarness();

describe.each(['3.1', '3.3', '3.4', '3.5'] as const)('TuyaClient %s', (version) => {
  it('reads dps', async () => {
    const { client } = await h.setup(version);
    await client.connect();
    expect(await client.getDps()).toEqual(INITIAL_DPS);
  });

  it('sends a control frame the device decodes', async () => {
    const { device, client } = await h.setup(version);
    await client.connect();
    await client.setDps({ '20': false });
    expect(device.controls).toEqual([{ '20': false }]);
  });

  it("emits 'dps' for a pushed STATUS", async () => {
    const { device, client } = await h.setup(version);
    await client.connect();
    await client.getDps(); // round trip: the device has seen the whole handshake
    const pushed = nextEvent(client, 'dps');
    device.pushStatus({ '22': 800 });
    expect(await pushed).toEqual([{ '22': 800 }]);
  });

  it('reads dps sent as an empty ack followed by STATUS', async () => {
    const { client } = await h.setup(version, { ackQueryBeforeStatus: true });
    await client.connect();
    expect(await client.getDps()).toEqual(INITIAL_DPS);
  });

  it('times out when the device never answers', async () => {
    const { client } = await h.setup(version, { silent: true }, { timeoutMs: 150 });
    await client.connect();
    const started = Date.now();
    await expect(client.getDps()).rejects.toBeInstanceOf(TuyaTimeoutError);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });
});
