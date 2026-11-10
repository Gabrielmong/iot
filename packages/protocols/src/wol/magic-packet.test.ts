import { describe, expect, it } from 'vitest';
import { magicPacket } from './magic-packet.js';

describe('magicPacket', () => {
  it('is 6 x 0xff then the MAC 16 times', () => {
    const p = magicPacket('aa:bb:cc:dd:ee:ff');
    expect(p.length).toBe(102);
    expect([...p.subarray(0, 6)]).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(p.subarray(6, 12).toString('hex')).toBe('aabbccddeeff');
    expect(p.subarray(96, 102).toString('hex')).toBe('aabbccddeeff');
  });
});
