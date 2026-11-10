import { createSocket, type Socket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverKasa } from './discovery.js';

const KP303_RESULT = {
  device_id: '8006A1B2C3D4E5F60718293A4B5C6D7E8F901234',
  owner: '0123456789ABCDEF0123456789ABCDEF',
  device_type: 'IOT.SMARTPLUGSWITCH',
  device_model: 'KP303(US)',
  ip: '192.168.1.50',
  mac: 'AA-BB-CC-DD-EE-FF',
  is_support_iot_cloud: true,
  obd_src: 'tplink',
  factory_default: false,
  mgt_encrypt_schm: { is_support_https: false, encrypt_type: 'KLAP', http_port: 80, lv: 2 },
};

function reply(result: object): Buffer {
  const header = Buffer.from('02000001000000001100000000000000', 'hex');
  return Buffer.concat([header, Buffer.from(JSON.stringify({ error_code: 0, result }))]);
}

describe('discoverKasa', () => {
  let responder: Socket | undefined;
  afterEach(() => new Promise<void>((resolve) => (responder ? responder.close(() => resolve()) : resolve())));

  /** A fake device on an ephemeral localhost port that answers every probe with `answer(probe)`. */
  async function fakeDevice(answer: (probe: Buffer) => Buffer[]): Promise<{ port: number; probes: Buffer[] }> {
    const probes: Buffer[] = [];
    const socket = createSocket('udp4');
    responder = socket;
    socket.on('message', (msg, rinfo) => {
      probes.push(msg);
      for (const out of answer(msg)) socket.send(out, rinfo.port, rinfo.address);
    });
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    return { port: socket.address().port, probes };
  }

  it('probes with the v2 query and reports each responding device once', async () => {
    const device = await fakeDevice(() => [reply(KP303_RESULT)]);
    const found = await discoverKasa(300, { bindAddress: '127.0.0.1', target: '127.0.0.1', port: device.port });
    expect(found).toEqual([{ ip: '127.0.0.1', deviceId: KP303_RESULT.device_id, model: 'KP303(US)' }]);
    expect(device.probes.length).toBeGreaterThanOrEqual(2);
    const probe = device.probes[0]!;
    expect(probe.subarray(0, 4).toString('hex')).toBe('02000001');
    expect(JSON.parse(probe.subarray(16).toString('utf8')).params.rsa_key).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
  });

  it('ignores replies that are not discovery results', async () => {
    const device = await fakeDevice(() => [Buffer.from('garbage'), reply({ device_type: 'X' }), Buffer.alloc(16)]);
    expect(await discoverKasa(200, { bindAddress: '127.0.0.1', target: '127.0.0.1', port: device.port })).toEqual([]);
  });

  it('returns an empty list when nothing answers', async () => {
    const device = await fakeDevice(() => []);
    expect(await discoverKasa(150, { bindAddress: '127.0.0.1', target: '127.0.0.1', port: device.port })).toEqual([]);
  });
});
