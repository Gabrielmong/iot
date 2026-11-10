import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeKasaDevice } from '../test/fake-kasa-device.js';
import { KasaClient } from './client.js';
import { KasaDeviceError, KasaError } from './errors.js';
import { KlapSession } from './klap.js';
import { parseSysInfo } from './sysinfo.js';

const DEVICE_ID = '8006A1B2C3D4E5F60718293A4B5C6D7E8F901234';
const child = (n: number) => `${DEVICE_ID}0${n}`;

describe('KasaClient (KP303 over KLAP)', () => {
  let device: FakeKasaDevice;
  let client: KasaClient;

  beforeEach(async () => {
    device = await FakeKasaDevice.start({
      variant: 'v2',
      username: 'me@example.com',
      password: 'pw',
      deviceId: DEVICE_ID,
      model: 'KP303(US)',
      alias: 'Desk strip',
      children: [
        { id: child(0), alias: 'Lamp', state: 1 },
        { id: child(1), alias: 'Monitor', state: 0 },
        { id: child(2), alias: 'Speakers', state: 1 },
      ],
    });
    client = new KasaClient(new KlapSession({ ip: '127.0.0.1', port: device.port, username: 'me@example.com', password: 'pw' }));
  });
  afterEach(() => device.close());

  it('reads KP303 sysinfo with its three outlets', async () => {
    expect(await client.getSysInfo()).toEqual({
      deviceId: DEVICE_ID,
      model: 'KP303(US)',
      alias: 'Desk strip',
      children: [
        { id: child(0), alias: 'Lamp', on: true },
        { id: child(1), alias: 'Monitor', on: false },
        { id: child(2), alias: 'Speakers', on: true },
      ],
    });
  });

  it('switches one outlet with a child_ids context', async () => {
    await client.setRelay(false, child(2));
    expect(JSON.stringify(device.requests.at(-1))).toBe(
      `{"context":{"child_ids":["${child(2)}"]},"system":{"set_relay_state":{"state":0}}}`,
    );
    expect(device.children.map((c) => c.state)).toEqual([1, 0, 0]);
  });

  it('raises KasaDeviceError when the device reports an err_code', async () => {
    await expect(client.setRelay(true, 'nope')).rejects.toBeInstanceOf(KasaDeviceError);
  });
});

describe('KasaClient (single plug)', () => {
  let device: FakeKasaDevice;
  afterEach(() => device.close());

  it('reads the relay state and switches the plug without a child context', async () => {
    device = await FakeKasaDevice.start({ variant: 'v1', username: 'u', password: 'p', model: 'HS103(US)', relayState: 0 });
    const client = new KasaClient(new KlapSession({ ip: '127.0.0.1', port: device.port, username: 'u', password: 'p' }));
    expect(await client.getSysInfo()).toMatchObject({ model: 'HS103(US)', on: false });
    await client.setRelay(true);
    expect(JSON.stringify(device.requests.at(-1))).toBe('{"system":{"set_relay_state":{"state":1}}}');
    expect(device.relayState).toBe(1);
    expect((await client.getSysInfo()).children).toBeUndefined();
  });
});

describe('parseSysInfo identity checks', () => {
  it('rejects sysinfo without a deviceId', () => {
    expect(() => parseSysInfo({ model: 'KP303(US)', alias: 'x' })).toThrow(KasaError);
  });

  it('rejects a child without an id', () => {
    expect(() => parseSysInfo({ deviceId: 'D', model: 'KP303(US)', alias: 'x', children: [{ alias: 'a', state: 1 }] })).toThrow(KasaError);
  });
});
