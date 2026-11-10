import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeBrightness, encodeColorTemp } from './messages.js';

const json = (v: unknown): Buffer => Buffer.from(JSON.stringify(v));

describe('decodeMessage', () => {
  it.each([
    ['non-JSON', Buffer.from('not json')],
    ['empty', Buffer.alloc(0)],
    ['JSON null', json(null)],
    ['JSON array', json([1])],
    ['no msg', json({ x: 1 })],
    ['msg without data', json({ msg: { cmd: 'scan' } })],
    ['unknown cmd', json({ msg: { cmd: 'turn', data: {} } })],
    ['scan missing sku', json({ msg: { cmd: 'scan', data: { ip: '1.2.3.4', device: 'AA' } } })],
    ['scan wrong type', json({ msg: { cmd: 'scan', data: { ip: 1, device: 'AA', sku: 'H' } } })],
    ['status missing brightness', json({ msg: { cmd: 'devStatus', data: { onOff: 1 } } })],
    ['status string onOff', json({ msg: { cmd: 'devStatus', data: { onOff: '1', brightness: 5 } } })],
  ])('returns undefined for %s', (_name, buf) => {
    expect(decodeMessage(buf)).toBeUndefined();
  });

  it('decodes a status with no colour as colour mode without a colour', () => {
    expect(decodeMessage(json({ msg: { cmd: 'devStatus', data: { onOff: 1, brightness: 5 } } }))).toEqual({
      cmd: 'devStatus',
      state: { on: true, brightness: 5, mode: 'color' },
    });
  });
});

describe('encoders', () => {
  it('throw RangeError on non-finite input', () => {
    expect(() => encodeBrightness(NaN)).toThrow(RangeError);
    expect(() => encodeColorTemp(Infinity)).toThrow(RangeError);
  });
});
