import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digestResponse } from './digest.js';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe('digestResponse', () => {
  it('matches the RFC 2617 section 3.5 example (qop=auth)', () => {
    expect(
      digestResponse({
        username: 'Mufasa',
        password: 'Circle Of Life',
        realm: 'testrealm@host.com',
        nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
        method: 'GET',
        uri: '/dir/index.html',
        qop: { nc: '00000001', cnonce: '0a4f113b' },
      }),
    ).toBe('6629fae49393a05397450978507c4ef1');
  });

  it('computes MD5(HA1:nonce:HA2) without qop', () => {
    const expected = md5(`${md5('u:r:p')}:n:${md5('DESCRIBE:rtsp://h/x')}`);
    expect(digestResponse({ username: 'u', password: 'p', realm: 'r', nonce: 'n', method: 'DESCRIBE', uri: 'rtsp://h/x' })).toBe(expected);
  });
});
