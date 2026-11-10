import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ecbDecrypt, ecbEncrypt } from './aes.js';

const key = Buffer.from('0123456789abcdef');

/** Encrypts `plain` as-is (no automatic padding), so tests can craft arbitrary pad bytes. */
function rawEcb(plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

describe('ecbDecrypt PKCS#7 unpadding', () => {
  it('round-trips padded data', () => {
    expect(ecbDecrypt(key, ecbEncrypt(key, Buffer.from('hello'))).toString()).toBe('hello');
  });

  it('accepts a full block of padding', () => {
    expect(ecbDecrypt(key, rawEcb(Buffer.alloc(16, 16))).length).toBe(0);
  });

  it('rejects padding whose bytes do not all equal the pad length', () => {
    const plain = Buffer.concat([Buffer.from('abcdefghijklm'), Buffer.from([0x07, 0x03, 0x03])]);
    expect(() => ecbDecrypt(key, rawEcb(plain))).toThrow(/padding/);
  });

  it.each([0, 17])('rejects a pad length byte of %i', (padLen) => {
    const plain = Buffer.concat([Buffer.alloc(15, 0x41), Buffer.from([padLen])]);
    expect(() => ecbDecrypt(key, rawEcb(plain))).toThrow(/padding/);
  });
});
