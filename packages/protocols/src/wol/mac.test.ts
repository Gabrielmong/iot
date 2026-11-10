import { describe, expect, it } from 'vitest';
import { parseMac } from './mac.js';

describe('parseMac', () => {
  it.each(['AA-BB-CC-DD-EE-FF', 'aa:bb:cc:dd:ee:ff', 'aabb.ccdd.eeff', 'AABBCCDDEEFF', '  AA:BB:CC:DD:EE:FF  '])('normalises %s', (input) => {
    expect(parseMac(input)).toBe('aa:bb:cc:dd:ee:ff');
  });

  it.each(['aa:bb:cc:dd:ee', 'zz:bb:cc:dd:ee:ff', '', 'aa:bb:cc:dd:ee:ff:00'])('rejects %j', (input) => {
    expect(parseMac(input)).toBeNull();
  });
});
