import { describe, expect, it } from 'vitest';
import { TuyaCmd } from './constants.js';
import { udpKey } from './crypto.js';
import { decodeBroadcast } from './broadcast.js';
import { encodeFrame } from './frame.js';

const info = (version: string) => ({ ip: '192.168.1.50', gwId: 'gw123', productKey: 'pk456', version });
const json = (o: unknown) => Buffer.from(JSON.stringify(o));

function packet(version: '3.1' | '3.3' | '3.5', payload: Buffer, retcode?: number): Buffer {
  return encodeFrame({ version, key: udpKey, seq: 0, cmd: TuyaCmd.UDP_NEW, payload, retcode });
}

const expected = (version: string) => ({ gwId: 'gw123', productKey: 'pk456', version });

describe('decodeBroadcast', () => {
  it('decodes a plain-JSON 55AA broadcast (port 6666) with a retcode', () => {
    expect(decodeBroadcast(packet('3.1', json(info('3.1')), 0))).toEqual(expected('3.1'));
  });

  it('decodes a plain-JSON 55AA broadcast without a retcode', () => {
    expect(decodeBroadcast(packet('3.1', json(info('3.1'))))).toEqual(expected('3.1'));
  });

  it('decodes an ECB/udpKey 55AA broadcast (port 6667) with and without a retcode', () => {
    expect(decodeBroadcast(packet('3.3', json(info('3.3')), 0))).toEqual(expected('3.3'));
    expect(decodeBroadcast(packet('3.3', json(info('3.3'))))).toEqual(expected('3.3'));
  });

  it('decodes a GCM/udpKey 6699 broadcast (port 7000), trimming trailing NULs', () => {
    const payload = Buffer.concat([json(info('3.5')), Buffer.alloc(3)]);
    expect(decodeBroadcast(packet('3.5', payload))).toEqual(expected('3.5'));
    expect(decodeBroadcast(packet('3.5', payload, 0))).toEqual(expected('3.5'));
  });

  it('defaults a missing productKey to an empty string', () => {
    expect(decodeBroadcast(packet('3.3', json({ gwId: 'gw123', version: '3.3' }), 0))).toEqual({
      gwId: 'gw123', productKey: '', version: '3.3',
    });
  });

  it.each([
    ['plain', packet('3.1', json(info('3.1')), 0), '3.1'],
    ['ECB', packet('3.3', json(info('3.3')), 0), '3.3'],
  ] as const)('accepts a %s broadcast whose CRC does not verify, like tinytuya', (_, p, version) => {
    const bad = Buffer.from(p);
    bad[bad.length - 6] ^= 1; // inside the CRC32 trailer
    expect(decodeBroadcast(bad)).toEqual(expected(version));
  });

  it('still ignores a packet with a bad CRC whose payload is garbage', () => {
    const bad = packet('3.3', Buffer.from('definitely not json'), 0);
    bad[bad.length - 6] ^= 1;
    expect(decodeBroadcast(bad)).toBeUndefined();
  });

  it.each([
    ['garbage', Buffer.from('not a tuya packet at all')],
    ['an unknown version', packet('3.3', json(info('2.2')), 0)],
    ['a missing gwId', packet('3.3', json({ version: '3.3' }), 0)],
    ['a non-JSON payload', packet('3.1', Buffer.from('hello'), 0)],
  ])('ignores %s', (_, msg) => {
    expect(decodeBroadcast(msg)).toBeUndefined();
  });
});
