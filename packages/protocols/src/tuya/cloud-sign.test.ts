import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { signCloudRequest, type SignInput } from './cloud-sign.js';

const vectors = JSON.parse(
  readFileSync(new URL('../test/fixtures/tuya-cloud-sign.json', import.meta.url), 'utf8'),
) as Array<SignInput & { sign: string }>;

describe('signCloudRequest', () => {
  it('has the token-request and business-request vectors', () => {
    expect(vectors.map((v) => v.accessToken)).toEqual(['', 'tok']);
  });

  it.each([0, 1])('matches the tinytuya golden signature for vector %i', (i) => {
    const { sign, ...input } = vectors[i]!;
    expect(signCloudRequest(input)).toBe(sign);
  });
});
