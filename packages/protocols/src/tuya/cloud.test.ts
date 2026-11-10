import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CloudHttp } from './cloud-http.js';
import { TuyaCloud, TuyaCloudAuthError, TuyaCloudExpiredError } from './cloud.js';

type Call = { url: string; headers: Record<string, string>; body?: string };

/** Fake fetch answering by URL path prefix; records every call. */
function fakeFetch(routes: Record<string, unknown | (() => unknown)>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
    const path = new URL(url).pathname;
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unrouted ${url}`);
    const body = routes[key];
    return new Response(JSON.stringify(typeof body === 'function' ? body() : body), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const token = { success: true, result: { access_token: 'tok', expire_time: 7200 } };
const ok = (result: unknown) => ({ success: true, result });

const lightSpec = ok({
  functions: [
    { code: 'switch_led', dp_id: 20 },
    { code: 'work_mode', dp_id: 21 },
    { code: 'bright_value_v2', dp_id: 22, values: '{"min":10,"max":1000}' },
    { code: 'temp_value_v2', dp_id: 23 },
    { code: 'colour_data_v2', dp_id: 24 },
  ],
});

const routes = {
  '/v1.0/token': token,
  '/v1.0/iot-01/associated-users/devices': ok({ devices: [{ id: 'd1', uid: 'u1' }, { id: 'd2', uid: 'u1' }] }),
  '/v1.3/iot-03/devices': ok({
    list: [
      { id: 'd1', name: ' Lamp ', category: 'dj', product_id: 'p1', local_key: 'k1', ip: '10.0.0.5', online: true },
      { id: 'd2', name: 'Plug', category: 'cz', product_id: 'p2', local_key: 'k2' },
    ],
  }),
  '/v1.1/devices/d1/specifications': lightSpec,
  '/v1.1/devices/d2/specifications': ok({ functions: [{ code: 'switch_1', dp_id: 1 }] }),
};

describe('TuyaCloud.listDevices', () => {
  it('maps devices with local keys and a dpSchema derived from the spec', async () => {
    const { impl, calls } = fakeFetch(routes);
    const devices = await new TuyaCloud({ accessId: 'id', accessSecret: 'secret', region: 'eu', fetchImpl: impl }).listDevices();

    expect(devices).toEqual([
      {
        id: 'd1',
        name: 'Lamp',
        category: 'dj',
        productId: 'p1',
        localKey: 'k1',
        ip: '10.0.0.5',
        online: true,
        dpSchema: {
          switch: '20',
          mode: '21',
          brightness: '22',
          colorTemp: '23',
          color: '24',
          brightnessRange: [10, 1000],
          colorFormat: 'hsv12',
        },
      },
      { id: 'd2', name: 'Plug', category: 'cz', productId: 'p2', localKey: 'k2' },
    ]);
    expect(calls[0]!.url).toBe('https://openapi.tuyaeu.com/v1.0/token?grant_type=1');
    expect(calls[0]!.headers.access_token).toBeUndefined();
    expect(calls[1]!.headers.access_token).toBe('tok');
    expect(calls[1]!.headers.client_id).toBe('id');
    expect(calls[1]!.headers.sign).toMatch(/^[0-9A-F]{64}$/);
  });

  it('derives the v1 layout from the plain codes', async () => {
    const { impl } = fakeFetch({
      ...routes,
      '/v1.1/devices/d1/specifications': ok({
        functions: [
          { code: 'switch_led', dp_id: 1 },
          { code: 'work_mode', dp_id: 2 },
          { code: 'bright_value', dp_id: 3 },
          { code: 'temp_value', dp_id: 4 },
          { code: 'colour_data', dp_id: 5 },
        ],
      }),
    });
    const [lamp] = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(lamp!.dpSchema).toEqual({
      switch: '1',
      mode: '2',
      brightness: '3',
      colorTemp: '4',
      color: '5',
      brightnessRange: [25, 255],
      colorFormat: 'rgbhsv14',
    });
  });

  it('fetches a token once and reuses it', async () => {
    const { impl, calls } = fakeFetch(routes);
    await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(calls.filter((c) => c.url.includes('/v1.0/token'))).toHaveLength(1);
  });

  it('refreshes the token when Tuya reports it invalid', async () => {
    let tokens = 0;
    let first = true;
    const { impl, calls } = fakeFetch({
      ...routes,
      '/v1.0/token': () => ({ success: true, result: { access_token: `tok${++tokens}`, expire_time: 7200 } }),
      '/v1.0/iot-01/associated-users/devices': () => {
        if (!first) return ok({ devices: [] });
        first = false;
        return { success: false, code: 1010, msg: 'token invalid' };
      },
    });
    await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(tokens).toBe(2);
    expect(calls.at(-1)!.headers.access_token).toBe('tok2');
  });

  it('throws TuyaCloudAuthError on bad credentials', async () => {
    const { impl } = fakeFetch({ '/v1.0/token': { success: false, code: 1004, msg: 'sign invalid' } });
    const cloud = new TuyaCloud({ accessId: 'id', accessSecret: 'bad', region: 'us', fetchImpl: impl });
    await expect(cloud.listDevices()).rejects.toBeInstanceOf(TuyaCloudAuthError);
  });

  it('throws TuyaCloudExpiredError when the IoT Core subscription lapsed', async () => {
    const { impl } = fakeFetch({
      ...routes,
      '/v1.0/iot-01/associated-users/devices': { success: false, code: 28841105, msg: 'No permissions' },
    });
    const cloud = new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl });
    await expect(cloud.listDevices()).rejects.toBeInstanceOf(TuyaCloudExpiredError);
  });

  it('does not leak the secret or a local key into error messages', async () => {
    const { impl } = fakeFetch({ '/v1.0/token': token });
    const leaky = (async () => {
      throw new Error('connect failed, headers: secret=topsecret local_key=k1');
    }) as unknown as typeof fetch;
    for (const fetchImpl of [leaky, fakeFetch({ '/v1.0/token': { success: false, code: 1004, msg: 'sign invalid' } }).impl, impl]) {
      const cloud = new TuyaCloud({ accessId: 'id', accessSecret: 'topsecret', region: 'us', fetchImpl });
      const err = await cloud.listDevices().catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain('topsecret');
      expect((err as Error).message).not.toContain('k1');
    }
  });

  it('degrades a device whose spec call fails, keeping the others', async () => {
    const threeRows = ok({
      list: [
        { id: 'd1', name: 'A', local_key: 'k1' },
        { id: 'd2', name: 'B', local_key: 'k2' },
        { id: 'd3', name: 'C', local_key: 'k3' },
      ],
    });
    const { impl } = fakeFetch({
      ...routes,
      '/v1.0/iot-01/associated-users/devices': ok({ devices: [{ id: 'd1', uid: 'u1' }] }),
      '/v1.3/iot-03/devices': threeRows,
      '/v1.1/devices/d2/specifications': { success: false, code: 2009, msg: 'no spec' },
      '/v1.1/devices/d3/specifications': lightSpec,
    });
    const devices = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(devices.map((d) => [d.id, d.localKey, d.dpSchema !== undefined])).toEqual([
      ['d1', 'k1', true],
      ['d2', 'k2', false],
      ['d3', 'k3', true],
    ]);
  });

  it('still propagates auth and expired errors from a spec call', async () => {
    for (const [code, type] of [[1004, TuyaCloudAuthError], [28841105, TuyaCloudExpiredError]] as const) {
      const { impl } = fakeFetch({ ...routes, '/v1.1/devices/d1/specifications': { success: false, code, msg: 'x' } });
      const cloud = new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl });
      await expect(cloud.listDevices()).rejects.toBeInstanceOf(type);
    }
  });

  it('follows last_row_key across pages', async () => {
    let page = 0;
    const { impl, calls } = fakeFetch({
      ...routes,
      '/v1.0/iot-01/associated-users/devices': () =>
        page++ === 0
          ? ok({ devices: [{ id: 'd1' }], has_more: true, last_row_key: 'rk1' })
          : ok({ devices: [{ id: 'd2' }], has_more: false }),
      '/v1.3/iot-03/devices': ok({ list: [] }),
      '/v1.1/devices/': ok({}),
    });
    const devices = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(devices.map((d) => d.id)).toEqual(['d1', 'd2']);
    const listCalls = calls.filter((c) => c.url.includes('associated-users'));
    expect(listCalls).toHaveLength(2);
    expect(listCalls[0]!.url).not.toContain('last_row_key');
    expect(listCalls[1]!.url).toContain('last_row_key=rk1');
  });
});

describe('CloudHttp signing', () => {
  it('sends the fixture signature for a signed business request', async () => {
    const vectors = JSON.parse(
      readFileSync(new URL('../test/fixtures/tuya-cloud-sign.json', import.meta.url), 'utf8'),
    ) as Array<{ sign: string }>;
    const { impl, calls } = fakeFetch({ '/v1.0/token': token, '/v1.0/users/abc/devices': ok([]) });
    const http = new CloudHttp({ accessId: 'id', accessSecret: 'secret', host: 'h', fetchImpl: impl, now: () => 1700000000000 });
    await http.get('/v1.0/users/abc/devices');
    expect(calls[0]!.headers.sign).toBe('3A0955D30829FF424CDE7A508D72DCD4D6C25196F5C0F566866AA52FEB633802');
    expect(calls[1]!.headers.access_token).toBe('tok');
    expect(calls[1]!.headers.t).toBe('1700000000000');
    expect(calls[1]!.headers.sign).toBe(vectors[1]!.sign);
  });
});

const camModel = ok({
  model: JSON.stringify({
    services: [{ properties: [{ code: 'ptz_control', accessMode: 'rw', typeSpec: { type: 'enum', range: ['0', '2'] } }, { code: 'basic_flip', accessMode: 'rw', typeSpec: { type: 'bool' } }] }],
  }),
});
const camRoutes = {
  '/v1.0/token': token,
  '/v1.0/iot-01/associated-users/devices': ok({ devices: [{ id: 'c1', uid: 'u1' }] }),
  '/v1.3/iot-03/devices': ok({
    list: [
      { id: 'c1', name: 'Cam', category: 'cdsxj', local_key: 'k1' },
      { id: 'c2', name: 'Fixed', category: 'sp', local_key: 'k2' },
      { id: 'l1', name: 'Lamp', category: 'dj', local_key: 'k3' },
    ],
  }),
  '/v1.1/devices/': ok({}),
  '/v2.0/cloud/thing/c1/model': camModel,
  '/v2.0/cloud/thing/c2/model': { success: false, code: 2009, msg: 'not support this device' },
};

describe('TuyaCloud camera features', () => {
  it('listDevices fetches the thing model for camera categories only', async () => {
    const { impl, calls } = fakeFetch(camRoutes);
    const devices = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(devices.find((d) => d.id === 'c1')!.cameraFeatures).toEqual({ ptz_control: { type: 'enum', range: ['0', '2'] }, basic_flip: { type: 'bool' } });
    expect(calls.some((c) => c.url.includes('/v2.0/cloud/thing/l1/'))).toBe(false);
  });

  it('a failed thing-model call leaves cameraFeatures absent and does not abort the sync', async () => {
    const { impl } = fakeFetch(camRoutes);
    const devices = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices();
    expect(devices.map((d) => d.id)).toEqual(['c1', 'c2', 'l1']);
    expect(devices.find((d) => d.id === 'c2')).not.toHaveProperty('cameraFeatures');
  });

  it('still propagates auth errors from a thing-model call', async () => {
    const { impl } = fakeFetch({ ...camRoutes, '/v2.0/cloud/thing/c1/model': { success: false, code: 1004, msg: 'x' } });
    await expect(new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).listDevices()).rejects.toBeInstanceOf(TuyaCloudAuthError);
  });

  it('readCameraValues maps shadow properties to a code→value record', async () => {
    const { impl, calls } = fakeFetch({
      '/v1.0/token': token,
      '/v2.0/cloud/thing/c1/shadow/properties': ok({ properties: [{ code: 'basic_flip', value: true, dp_id: 103 }, { code: 'basic_nightvision', value: '0' }] }),
    });
    const values = await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).readCameraValues('c1');
    expect(values).toEqual({ basic_flip: true, basic_nightvision: '0' });
    expect(calls.at(-1)!.url).toBe('https://openapi.tuyaus.com/v2.0/cloud/thing/c1/shadow/properties');
  });

  it('issueCameraProperties posts the properties as a JSON string', async () => {
    const { impl, calls } = fakeFetch({ '/v1.0/token': token, '/v2.0/cloud/thing/c1/shadow/properties/issue': ok({}) });
    await new TuyaCloud({ accessId: 'id', accessSecret: 's', region: 'us', fetchImpl: impl }).issueCameraProperties('c1', { ptz_stop: true });
    expect(calls.at(-1)!.url).toBe('https://openapi.tuyaus.com/v2.0/cloud/thing/c1/shadow/properties/issue');
    expect(calls.at(-1)!.body).toBe('{"properties":"{\\"ptz_stop\\":true}"}');
  });
});
