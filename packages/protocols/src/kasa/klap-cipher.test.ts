import { describe, expect, it } from 'vitest';
import { hex, kasaVectors } from '../test/kasa-vectors.js';
import { deriveKlapMaterial, KlapCipher } from './klap-cipher.js';

describe.each(kasaVectors)('KLAP cipher ($variant vector)', (v) => {
  const seeds = [hex(v.localSeedHex), hex(v.remoteSeedHex), hex(v.authHashHex)] as const;

  it('derives key, iv prefix, initial seq and signature key like python-kasa', () => {
    const m = deriveKlapMaterial(...seeds);
    expect(m.key.toString('hex')).toBe(v.keyHex);
    expect(m.ivPrefix.toString('hex')).toBe(v.ivHex);
    expect(m.initialSeq).toBe(v.initialSeq);
    expect(m.sig.toString('hex')).toBe(v.sigHex);
  });

  it('encrypts the first request byte-for-byte', () => {
    const cipher = new KlapCipher(...seeds);
    expect(v.seq).toBe(cipher.initialSeq + 1);
    expect(cipher.encrypt(Buffer.from(v.plaintext), v.seq).toString('hex')).toBe(v.requestBodyHex);
  });

  it('decrypts the device response to the vector plaintext', () => {
    const cipher = new KlapCipher(...seeds);
    expect(cipher.decrypt(hex(v.responseBodyHex), v.seq).toString('utf8')).toBe(v.responsePlaintext);
  });
});

describe('KlapCipher', () => {
  const [v] = kasaVectors;
  const cipher = new KlapCipher(hex(v!.localSeedHex), hex(v!.remoteSeedHex), hex(v!.authHashHex));

  it('round-trips at the int32 boundaries', () => {
    for (const seq of [-2147483648, -1, 0, 2147483647]) {
      const msg = Buffer.from(`{"seq":${seq}}`);
      expect(cipher.decrypt(cipher.encrypt(msg, seq), seq)).toEqual(msg);
    }
  });

  it('rejects a body too short to hold a signature and one block', () => {
    expect(() => cipher.decrypt(Buffer.alloc(40), 1)).toThrow();
  });
});
