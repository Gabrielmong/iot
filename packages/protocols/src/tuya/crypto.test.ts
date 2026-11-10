import { describe, expect, it } from 'vitest';
import { tuyaVectors } from '../test/tuya-vectors.js';
import { deriveSessionKey, udpKey } from './crypto.js';

describe('deriveSessionKey', () => {
  const finishes = tuyaVectors.filter((v) => v.kind === 'SESS_KEY_NEG_FINISH');

  it('has a vector for each session-key version', () => {
    expect(finishes.map((v) => v.version).sort()).toEqual(['3.4', '3.5']);
  });

  it.each(finishes.map((v) => [v.version, v] as const))('matches the golden session key (%s)', (_, v) => {
    const key = deriveSessionKey(
      v.version as '3.4' | '3.5',
      Buffer.from(v.localKey, 'utf8'),
      Buffer.from(v.localNonceHex!, 'hex'),
      Buffer.from(v.remoteNonceHex!, 'hex'),
    );
    expect(key.toString('hex')).toBe(v.sessionKeyHex);
  });
});

describe('udpKey', () => {
  it('is md5("yGAdlopoPVldABfn")', () => {
    expect(udpKey.toString('hex')).toBe('6c1ec8e2bb9bb59ab50b0daf649b410a');
  });
});
